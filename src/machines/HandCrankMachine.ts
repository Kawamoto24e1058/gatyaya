// 手回し式ガチャ：ハンドルを指でぐるっと 1 周で 1 回。
// 30° ごとに「ガリ」、1 周で「ゴトン」。音の間隔は回す速さにそのまま追従する（角度ベースで鳴らすため）。
import Phaser from 'phaser';
import { CSS } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import type { GachaMachineDef } from '../data/machines';
import type { Rarity } from '../data/rarity';
import { capsuleKey } from '../ui/textures';
import { txt } from '../ui/widgets';
import { registerMachineView, type MachineHooks, type MachineView } from './types';

const TAU = Math.PI * 2;
const STEP = Math.PI / 6; // 30°
const GLOBE = { x: 360, y: 262, r: 140 };
const PIVOT = { x: 360, y: 522 };
const ARM = 74;
const GRAB_RADIUS = 160;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

class HandCrankMachine implements MachineView {
  readonly outlet = { x: 360, y: 694 };

  private root: Phaser.GameObjects.Container;
  private globeInner: Phaser.GameObjects.Container;
  private rotor: Phaser.GameObjects.Container;
  private flap: Phaser.GameObjects.Rectangle;
  private hint: Phaser.GameObjects.Container;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;

  private enabled = true;
  private dragId: number | null = null;
  private lastPointerAngle = 0;
  private lastMoveAt = 0;
  private omega = 0;
  private progress = 0;
  private steps = 0;
  private deniedThisGesture = false;
  private idleTimer?: Phaser.Time.TimerEvent;

  constructor(
    private scene: Phaser.Scene,
    readonly def: GachaMachineDef,
    private hooks: MachineHooks,
  ) {
    this.root = scene.add.container(0, 0).setDepth(100);

    // ---- 本体 ----
    const body = scene.add.graphics();
    body.fillStyle(0x000000, 0.3);
    body.fillRoundedRect(196, 404, 328, 272, 30);
    body.fillStyle(def.bodyColor, 1);
    body.fillRoundedRect(196, 396, 328, 272, 30);
    body.fillStyle(0xffffff, 0.15);
    body.fillRoundedRect(208, 404, 304, 60, 20);
    // 排出口
    body.fillStyle(0x1b1430, 1);
    body.fillRoundedRect(312, 628, 96, 44, 12);
    // ハンドルの台座（金属プレート）
    body.fillStyle(0x2a1f45, 0.25);
    body.fillCircle(PIVOT.x, PIVOT.y + 4, 98);
    body.fillStyle(0xe8e4f0, 1);
    body.fillCircle(PIVOT.x, PIVOT.y, 96);
    body.lineStyle(4, 0x9f97b8, 1);
    body.strokeCircle(PIVOT.x, PIVOT.y, 96);
    for (let i = 0; i < 12; i++) {
      const a = i * STEP;
      body.fillStyle(0x9f97b8, 1);
      body.fillCircle(PIVOT.x + Math.cos(a) * 84, PIVOT.y + Math.sin(a) * 84, 4);
    }

    // ---- 球体（中に景品カプセル） ----
    const globeBack = scene.add.graphics();
    globeBack.fillStyle(0xffffff, 0.12);
    globeBack.fillCircle(GLOBE.x, GLOBE.y, GLOBE.r);
    this.globeInner = scene.add.container(GLOBE.x, GLOBE.y);
    const deco: Rarity[] = ['N', 'N', 'N', 'N', 'N', 'N', 'R', 'R', 'R', 'SR', 'SR', 'SSR', 'N', 'R', 'N', 'UR', 'N', 'R'];
    deco.forEach((r, i) => {
      const a = i * 2.39996; // 黄金角で散らす
      const d = Math.sqrt((i + 0.5) / deco.length) * (GLOBE.r - 38);
      const img = scene.add.image(Math.cos(a) * d, Math.sin(a) * d + 18, capsuleKey(r)).setScale(0.78);
      img.setRotation(Math.random() * TAU);
      this.globeInner.add(img);
    });
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff);
    maskShape.fillCircle(GLOBE.x, GLOBE.y, GLOBE.r - 4);
    this.globeInner.setMask(maskShape.createGeometryMask());
    const globeFront = scene.add.graphics();
    globeFront.lineStyle(8, 0xffffff, 0.85);
    globeFront.strokeCircle(GLOBE.x, GLOBE.y, GLOBE.r);
    globeFront.fillStyle(0xffffff, 0.35);
    globeFront.fillEllipse(GLOBE.x - 62, GLOBE.y - 70, 60, 26);
    // 球体の台座リング
    globeFront.fillStyle(0x2a1f45, 1);
    globeFront.fillRoundedRect(232, 380, 256, 34, 14);
    const price = txt(scene, 360, 397, `1回 ${def.cost}コイン`, 22, { color: CSS.gold });

    // ---- ハンドル（回転部） ----
    this.rotor = scene.add.container(PIVOT.x, PIVOT.y);
    const arm = scene.add.graphics();
    arm.fillStyle(0x2a1f45, 0.3);
    arm.fillRoundedRect(-14, -ARM + 4, 28, ARM + 4, 12);
    arm.fillStyle(0x5c5277, 1);
    arm.fillRoundedRect(-14, -ARM, 28, ARM, 12);
    arm.fillStyle(0x7d7399, 1);
    arm.fillCircle(0, 0, 26);
    arm.fillStyle(0xffffff, 0.4);
    arm.fillCircle(-6, -6, 8);
    const knob = scene.add.graphics();
    knob.fillStyle(0x000000, 0.25);
    knob.fillCircle(0, -ARM + 5, 34);
    knob.fillStyle(0xffc531, 1);
    knob.fillCircle(0, -ARM, 34);
    knob.fillStyle(0xffffff, 0.5);
    knob.fillCircle(-10, -ARM - 10, 10);
    this.rotor.add([arm, knob]);

    // 排出口のフタ
    this.flap = scene.add.rectangle(360, 630, 92, 10, 0xffffff, 0.9).setOrigin(0.5, 0);

    // ---- 回し方のヒント ----
    this.hint = scene.add.container(PIVOT.x, PIVOT.y);
    const hg = scene.add.graphics();
    hg.lineStyle(8, 0xffffff, 0.85);
    hg.beginPath();
    hg.arc(0, 0, 124, -Math.PI * 0.9, -Math.PI * 0.1, false);
    hg.strokePath();
    const tip = { x: Math.cos(-Math.PI * 0.1) * 124, y: Math.sin(-Math.PI * 0.1) * 124 };
    hg.fillStyle(0xffffff, 0.85);
    hg.fillTriangle(tip.x - 14, tip.y - 14, tip.x + 16, tip.y - 4, tip.x - 2, tip.y + 18);
    const ht = txt(scene, -258, 0, 'ぐるっと\n回す！', 28, { stroke: '#1b1430', strokeThickness: 6 });
    this.hint.add([hg, ht]);
    scene.tweens.add({ targets: hg, rotation: 0.5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.smoke = scene.add.particles(0, 0, 'smoke', {
      emitting: false,
      speed: { min: 60, max: 180 },
      angle: { min: 10, max: 170 },
      scale: { start: 0.7, end: 2.0 },
      alpha: { start: 0.55, end: 0 },
      gravityY: -260,
      lifespan: 480,
      tint: [0xffffff, 0xe0d8ff],
    });
    this.smoke.setDepth(300);

    this.root.add([body, globeBack, this.globeInner, globeFront, price, this.flap, this.rotor, this.hint]);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    this.scheduleHint();
  }

  private scheduleHint() {
    this.idleTimer?.remove();
    this.idleTimer = this.scene.time.delayedCall(3500, () => {
      if (this.dragId === null) this.scene.tweens.add({ targets: this.hint, alpha: 1, duration: 300 });
    });
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (!this.enabled || this.dragId !== null) return;
    const dx = p.worldX - PIVOT.x;
    const dy = p.worldY - PIVOT.y;
    if (dx * dx + dy * dy > GRAB_RADIUS * GRAB_RADIUS) return;
    this.dragId = p.id;
    this.lastPointerAngle = Math.atan2(dy, dx);
    this.lastMoveAt = performance.now();
    this.omega = 0;
    this.deniedThisGesture = false;
    this.hint.setAlpha(0);
    this.idleTimer?.remove();
    // 触れた瞬間に握った手応え
    sfx.play('gari', { rate: 0.75, vol: 0.5 });
    if (this.progress === 0) {
      const ok = this.hooks.canPull();
      if (ok !== true) this.deny(ok);
    }
  }

  private deny(reason: string) {
    if (this.deniedThisGesture) return;
    this.deniedThisGesture = true;
    this.hooks.onDenied(reason);
    const r0 = this.rotor.rotation;
    this.scene.tweens.add({ targets: this.rotor, rotation: r0 + 0.12, duration: 45, yoyo: true, repeat: 2 });
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.dragId || !this.enabled) return;
    const a = Math.atan2(p.worldY - PIVOT.y, p.worldX - PIVOT.x);
    let d = wrapAngle(a - this.lastPointerAngle);
    this.lastPointerAngle = a;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveAt) / 1000;
    this.lastMoveAt = now;
    // ラチェット：逆回転は受け付けない
    if (d <= 0) {
      this.omega *= 0.6;
      return;
    }
    d = Math.min(d, Math.PI / 3); // 指が飛んだときの暴走防止
    if (this.progress === 0) {
      const ok = this.hooks.canPull();
      if (ok !== true) {
        this.deny(ok);
        return;
      }
    }
    this.omega = this.omega * 0.6 + (d / dt) * 0.4;
    this.progress += d;
    this.rotor.rotation += d;
    this.globeInner.rotation += d * 0.22;

    const target = Math.min(11, Math.floor(this.progress / STEP));
    let clicks = 0;
    while (this.steps < target) {
      this.steps++;
      if (clicks++ < 2) this.click();
    }
    if (this.progress >= TAU) this.complete();
  }

  private click() {
    const rate = 0.9 + Math.min(0.35, this.omega * 0.025) + (Math.random() - 0.5) * 0.08;
    sfx.play('gari', { rate, vol: 0.9 });
    // 中のカプセルがガチャッと揺れる
    this.globeInner.y = GLOBE.y + 3;
    this.scene.tweens.add({ targets: this.globeInner, y: GLOBE.y, duration: 60 });
    vibrate(4);
  }

  private complete() {
    this.progress = 0;
    this.steps = 0;
    const r0 = this.rotor.rotation;
    // 一周したらハンドルを“カチッ”と定位置へスナップ
    this.rotor.rotation = Math.round(r0 / TAU) * TAU;

    sfx.play('goton', { rate: 0.95 + Math.random() * 0.1 });
    vibrate(25);
    this.scene.cameras.main.shake(70, 0.006);
    this.scene.tweens.add({ targets: this.root, y: 5, duration: 45, yoyo: true, ease: 'Quad.easeOut' });
    this.scene.tweens.add({ targets: this.flap, scaleY: -1.8, duration: 70, yoyo: true, hold: 120 });
    this.smoke.explode(12, this.outlet.x, this.outlet.y - 18);

    this.hooks.onPull();
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id !== this.dragId) return;
    this.dragId = null;
    this.scheduleHint();
  }

  setInputEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.dragId = null;
  }

  destroy() {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    this.idleTimer?.remove();
    this.smoke.destroy();
    this.root.destroy();
  }
}

registerMachineView('crank', (scene, def, hooks) => new HandCrankMachine(scene, def, hooks));

