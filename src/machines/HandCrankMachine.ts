// 手回し式ガチャ：ハンドルを指でぐるっと 1 周で 1 回。
// 30° ごとに「ガリ」、1 周で「ゴトン」。音の間隔は回す速さにそのまま追従する（角度ベースで鳴らすため）。
// 見た目は「付喪神になったガチャ機」：目がハンドルを追い、排出口が口になっている。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import type { GachaMachineDef } from '../data/machines';
import { RARITY_INFO, RARITIES, type Rarity } from '../data/rarity';
import { capsuleKey } from '../ui/textures';
import { drawPlate, txt } from '../ui/widgets';
import { registerMachineView, type MachineHooks, type MachineLayout, type MachineView } from './types';

const TAU = Math.PI * 2;
const STEP = Math.PI / 6; // 30°
const CX = 360;
const GLOBE_R = 120;
const ARM = 62;
const GRAB_RADIUS = 150;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

type Eye = { root: Phaser.GameObjects.Container; pupil: Phaser.GameObjects.Container; x: number; y: number };

class HandCrankMachine implements MachineView {
  readonly outlet: { x: number; y: number };
  readonly bottom: number;

  private globe: { x: number; y: number };
  private pivot: { x: number; y: number };
  private root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Container;
  private globeInner: Phaser.GameObjects.Container;
  private rotor: Phaser.GameObjects.Container;
  private mouth: Phaser.GameObjects.Container;
  private tag: Phaser.GameObjects.Container;
  private hint: Phaser.GameObjects.Container;
  private eyes: Eye[] = [];
  private squint: Phaser.GameObjects.Graphics;
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
  private blinkTimer?: Phaser.Time.TimerEvent;

  constructor(
    private scene: Phaser.Scene,
    readonly def: GachaMachineDef,
    private hooks: MachineHooks,
    layout: MachineLayout,
  ) {
    const T = layout.top;
    this.globe = { x: CX, y: T + 128 };
    const bodyTop = T + 252;
    const bodyBot = T + 590;
    this.pivot = { x: CX, y: T + 424 };
    this.outlet = { x: CX, y: T + 560 };
    this.bottom = bodyBot + 18;

    this.root = scene.add.container(0, 0).setDepth(100);
    this.body = scene.add.container(0, 0);

    // ---- 球体（中に景品カプセル） ----
    const g0 = scene.add.graphics();
    g0.fillStyle(PAL.ink, 0.85);
    g0.fillCircle(this.globe.x + 6, this.globe.y + 8, GLOBE_R + 6);
    g0.fillStyle(PAL.ink, 1);
    g0.fillCircle(this.globe.x, this.globe.y, GLOBE_R + 6);
    g0.fillStyle(0x6b5a78, 1);
    g0.fillCircle(this.globe.x, this.globe.y, GLOBE_R);
    this.globeInner = scene.add.container(this.globe.x, this.globe.y);
    const deco: Rarity[] = ['N', 'N', 'N', 'N', 'R', 'N', 'R', 'SR', 'N', 'R', 'SSR', 'N', 'SR', 'R', 'N', 'UR'];
    deco.forEach((r, i) => {
      const a = i * 2.39996; // 黄金角で散らす
      const d = Math.sqrt((i + 0.5) / deco.length) * (GLOBE_R - 34);
      const img = scene.add.image(Math.cos(a) * d, Math.sin(a) * d + 16, capsuleKey(r)).setScale(0.74);
      img.setRotation(Math.random() * TAU);
      this.globeInner.add(img);
    });
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff);
    maskShape.fillCircle(this.globe.x, this.globe.y, GLOBE_R);
    this.globeInner.setMask(maskShape.createGeometryMask());
    const glass = scene.add.graphics();
    glass.fillStyle(0xffffff, 0.1);
    glass.fillCircle(this.globe.x, this.globe.y, GLOBE_R);
    glass.fillStyle(0xffffff, 0.55);
    glass.fillEllipse(this.globe.x - 54, this.globe.y - 62, 54, 22);
    glass.fillStyle(0xffffff, 0.35);
    glass.fillEllipse(this.globe.x + 70, this.globe.y + 50, 14, 30);
    // てっぺんのフタ
    glass.fillStyle(PAL.ink, 1);
    glass.fillRoundedRect(CX - 46, T - 4, 92, 28, 12);
    glass.fillStyle(PAL.vermilion, 1);
    glass.fillRoundedRect(CX - 41, T + 1, 82, 18, 8);
    glass.fillStyle(PAL.ink, 1);
    glass.fillCircle(CX, T - 10, 11);
    glass.fillStyle(PAL.mustard, 1);
    glass.fillCircle(CX, T - 10, 7);
    // お札（ちょっと不気味）
    const ofuda = scene.add.container(this.globe.x + 78, this.globe.y - 30).setAngle(14);
    const og = scene.add.graphics();
    drawPlate(og, -15, -42, 30, 84, PAL.paper, { radius: 3, shadow: 3, outline: 3, shine: false });
    og.lineStyle(3, PAL.blood, 1);
    og.beginPath();
    og.moveTo(0, -32);
    og.lineTo(0, 32);
    og.strokePath();
    for (let y = -24; y < 30; y += 13) {
      og.beginPath();
      og.moveTo(-8, y);
      og.lineTo(0, y + 5);
      og.lineTo(8, y);
      og.strokePath();
    }
    ofuda.add(og);

    // ---- 胴体 ----
    const bg = scene.add.graphics();
    drawPlate(bg, 196, bodyTop, 328, bodyBot - bodyTop, def.bodyColor, { radius: 38, shadow: 9, outline: 6, shine: false });
    // 陰影（右半分を少し暗く）
    bg.fillStyle(0x000000, 0.12);
    bg.fillRoundedRect(400, bodyTop, 124, bodyBot - bodyTop, { tl: 0, tr: 38, br: 38, bl: 0 });
    bg.fillStyle(0xffffff, 0.16);
    bg.fillRoundedRect(212, bodyTop + 10, 160, 22, 11);
    // 首のリング
    drawPlate(bg, 236, bodyTop - 16, 248, 30, PAL.mustard, { radius: 12, shadow: 0, outline: 5, shine: true });
    // 足
    bg.fillStyle(PAL.ink, 1);
    bg.fillRoundedRect(232, bodyBot + 2, 62, 22, 10);
    bg.fillRoundedRect(426, bodyBot + 2, 62, 22, 10);
    // ハンドルの台座
    bg.fillStyle(PAL.ink, 1);
    bg.fillCircle(this.pivot.x + 4, this.pivot.y + 6, 92);
    bg.fillCircle(this.pivot.x, this.pivot.y, 92);
    bg.fillStyle(PAL.paper, 1);
    bg.fillCircle(this.pivot.x, this.pivot.y, 86);
    for (let i = 0; i < 12; i++) {
      const a = i * STEP;
      bg.fillStyle(PAL.ink, i % 3 === 0 ? 1 : 0.4);
      bg.fillCircle(this.pivot.x + Math.cos(a) * 74, this.pivot.y + Math.sin(a) * 74, i % 3 === 0 ? 5 : 3);
    }

    // ---- 目 ----
    const eyeY = bodyTop + 52;
    for (const ex of [CX - 62, CX + 62]) {
      const er = scene.add.container(ex, eyeY);
      const white = scene.add.graphics();
      white.fillStyle(PAL.ink, 1);
      white.fillEllipse(0, 0, 58, 50);
      white.fillStyle(0xfff8e8, 1);
      white.fillEllipse(0, 0, 48, 40);
      const pupil = scene.add.container(0, 0);
      const pg = scene.add.graphics();
      pg.fillStyle(PAL.ink, 1);
      pg.fillCircle(0, 0, 11);
      pg.fillStyle(0xffffff, 1);
      pg.fillCircle(-4, -4, 3.5);
      pupil.add(pg);
      er.add([white, pupil]);
      this.eyes.push({ root: er, pupil, x: ex, y: eyeY });
    }
    // 力んだ目（> <）
    this.squint = scene.add.graphics();
    this.squint.lineStyle(7, PAL.ink, 1);
    for (const [ex, s] of [
      [CX - 62, 1],
      [CX + 62, -1],
    ] as const) {
      this.squint.beginPath();
      this.squint.moveTo(ex - 16 * s, eyeY - 14);
      this.squint.lineTo(ex + 14 * s, eyeY);
      this.squint.lineTo(ex - 16 * s, eyeY + 14);
      this.squint.strokePath();
    }
    this.squint.setVisible(false);
    // ほっぺ
    const cheek = scene.add.graphics();
    cheek.fillStyle(0xf2a0a0, 0.5);
    cheek.fillEllipse(CX - 118, eyeY + 30, 30, 14);
    cheek.fillEllipse(CX + 118, eyeY + 30, 30, 14);

    // ---- 口（排出口） ----
    this.mouth = scene.add.container(this.outlet.x, this.outlet.y - 10);
    const mg = scene.add.graphics();
    mg.fillStyle(PAL.ink, 1);
    mg.fillRoundedRect(-62, -24, 124, 48, 20);
    mg.fillStyle(0x3a1a24, 1);
    mg.fillRoundedRect(-55, -18, 110, 36, 15);
    mg.fillStyle(0x7a2f3a, 1);
    mg.fillEllipse(0, 12, 60, 12);
    // 牙
    mg.fillStyle(0xfff8e8, 1);
    for (const fx of [-34, 34]) {
      mg.fillTriangle(fx - 9, -18, fx + 9, -18, fx, -2);
      mg.lineStyle(2, PAL.ink, 1);
      mg.strokeTriangle(fx - 9, -18, fx + 9, -18, fx, -2);
    }
    this.mouth.add(mg);

    // ---- 値札 ----
    this.tag = scene.add.container(222, bodyTop - 4);
    const tg = scene.add.graphics();
    tg.lineStyle(3, PAL.ink, 1);
    tg.lineBetween(0, 0, -6, 34);
    drawPlate(tg, -56, 30, 100, 64, PAL.paper, { radius: 8, shadow: 4, outline: 4, shine: false });
    tg.fillStyle(PAL.ink, 1);
    tg.fillCircle(-6, 38, 4);
    const tt1 = txt(scene, -6, 56, '1回', 18, { color: CSS.inkSoft });
    const tt2 = txt(scene, -6, 80, `${def.cost}`, 28, { color: CSS.bad });
    this.tag.add([tg, tt1, tt2]).setAngle(-8);

    // ---- ハンドル（回転部） ----
    this.rotor = scene.add.container(this.pivot.x, this.pivot.y);
    const arm = scene.add.graphics();
    arm.fillStyle(PAL.ink, 1);
    arm.fillRoundedRect(-17, -ARM - 4, 34, ARM + 22, 14);
    arm.fillStyle(0x8a7f9a, 1);
    arm.fillRoundedRect(-12, -ARM, 24, ARM + 12, 10);
    arm.fillStyle(PAL.ink, 1);
    arm.fillCircle(0, 0, 26);
    arm.fillStyle(0xa79cb8, 1);
    arm.fillCircle(0, 0, 20);
    arm.fillStyle(0xffffff, 0.45);
    arm.fillCircle(-6, -6, 6);
    const knob = scene.add.graphics();
    knob.fillStyle(PAL.ink, 1);
    knob.fillCircle(3, -ARM + 6, 36);
    knob.fillCircle(0, -ARM, 36);
    knob.fillStyle(PAL.mustard, 1);
    knob.fillCircle(0, -ARM, 30);
    knob.fillStyle(0xffffff, 0.55);
    knob.fillCircle(-10, -ARM - 10, 9);
    this.rotor.add([arm, knob]);

    this.body.add([bg, cheek, this.mouth, ...this.eyes.map((e) => e.root), this.squint]);

    // ---- 回し方のヒント ----
    this.hint = scene.add.container(this.pivot.x, this.pivot.y);
    const hg = scene.add.graphics();
    const arc = (w: number, col: number) => {
      hg.lineStyle(w, col, 1);
      hg.beginPath();
      hg.arc(0, 0, 118, -Math.PI * 0.85, -Math.PI * 0.15, false);
      hg.strokePath();
    };
    arc(14, PAL.ink);
    arc(7, PAL.paper);
    const tip = { x: Math.cos(-Math.PI * 0.15) * 118, y: Math.sin(-Math.PI * 0.15) * 118 };
    hg.fillStyle(PAL.ink, 1);
    hg.fillTriangle(tip.x - 18, tip.y - 18, tip.x + 22, tip.y - 4, tip.x - 2, tip.y + 24);
    hg.fillStyle(PAL.paper, 1);
    hg.fillTriangle(tip.x - 10, tip.y - 10, tip.x + 12, tip.y - 3, tip.x - 1, tip.y + 13);
    const ht = txt(scene, -236, -10, 'ぐるっと\n回す！', 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 7 });
    this.hint.add([hg, ht]);
    scene.tweens.add({ targets: hg, rotation: 0.45, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.smoke = scene.add.particles(0, 0, 'smoke', {
      emitting: false,
      speed: { min: 80, max: 220 },
      angle: { min: 15, max: 165 },
      scale: { start: 0.9, end: 0.2 },
      alpha: { start: 1, end: 0 },
      gravityY: -200,
      lifespan: 420,
    });
    this.smoke.setDepth(300);

    this.root.add([g0, this.globeInner, glass, ofuda, this.body, this.tag, this.rotor, this.hint]);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    this.scheduleHint();
    this.scheduleBlink();
    this.lookAtKnob();
  }

  // ---------- 表情 ----------

  private scheduleBlink() {
    this.blinkTimer = this.scene.time.delayedCall(Phaser.Math.Between(1800, 4200), () => {
      if (!this.squint.visible) {
        for (const e of this.eyes) this.scene.tweens.add({ targets: e.root, scaleY: 0.08, duration: 60, yoyo: true });
      }
      this.scheduleBlink();
    });
  }

  private lookAtKnob() {
    const a = this.rotor.rotation - Math.PI / 2;
    const kx = this.pivot.x + Math.cos(a) * ARM;
    const ky = this.pivot.y + Math.sin(a) * ARM;
    for (const e of this.eyes) {
      const dx = kx - e.x;
      const dy = ky - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.pupil.setPosition((dx / d) * 9, (dy / d) * 8);
    }
  }

  private setStrain(on: boolean) {
    this.squint.setVisible(on);
    for (const e of this.eyes) e.root.setVisible(!on);
  }

  react(rarityIndex: number) {
    if (rarityIndex < 2) return;
    // 目を見開いて跳ねる
    this.setStrain(false);
    for (const e of this.eyes) {
      e.pupil.setPosition(0, 0);
      this.scene.tweens.add({ targets: e.root, scale: 1.35, duration: 120, yoyo: true, hold: 300 + rarityIndex * 150 });
      this.scene.tweens.add({ targets: e.pupil, scale: 0.55, duration: 120, yoyo: true, hold: 300 + rarityIndex * 150 });
    }
    this.scene.tweens.add({ targets: this.root, y: -16 - rarityIndex * 4, duration: 110, yoyo: true, ease: 'Quad.easeOut', repeat: rarityIndex >= 4 ? 2 : 0 });
    // 球体の中身がざわつく
    this.scene.tweens.add({ targets: this.globeInner, angle: this.globeInner.angle + 40, duration: 400, ease: 'Back.easeOut' });
    const color = RARITY_INFO[RARITIES[rarityIndex]].color;
    const flash = this.scene.add.circle(this.globe.x, this.globe.y, GLOBE_R, color, 0.55).setDepth(101);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
  }

  // ---------- 入力 ----------

  private scheduleHint() {
    this.idleTimer?.remove();
    this.idleTimer = this.scene.time.delayedCall(3500, () => {
      if (this.dragId === null) this.scene.tweens.add({ targets: this.hint, alpha: 1, duration: 300 });
    });
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (!this.enabled || this.dragId !== null) return;
    const dx = p.worldX - this.pivot.x;
    const dy = p.worldY - this.pivot.y;
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
    // 困り顔：首を振る
    this.scene.tweens.add({ targets: this.body, x: 6, duration: 50, yoyo: true, repeat: 3 });
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.dragId || !this.enabled) return;
    const a = Math.atan2(p.worldY - this.pivot.y, p.worldX - this.pivot.x);
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
    // 速く回すと力む
    this.setStrain(this.omega > 9);
    this.lookAtKnob();

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
    // 中のカプセルがガチャッと揺れ、体も少しきしむ
    this.globeInner.y = this.globe.y + 3;
    this.scene.tweens.add({ targets: this.globeInner, y: this.globe.y, duration: 60 });
    this.body.y = 1.5;
    this.scene.tweens.add({ targets: this.body, y: 0, duration: 50 });
    vibrate(4);
  }

  private complete() {
    this.progress = 0;
    this.steps = 0;
    // 一周したらハンドルを“カチッ”と定位置へスナップ
    this.rotor.rotation = Math.round(this.rotor.rotation / TAU) * TAU;

    sfx.play('goton', { rate: 0.95 + Math.random() * 0.1 });
    vibrate(25);
    this.scene.cameras.main.shake(70, 0.006);
    // ドスンと沈んで戻る（スクワッシュ）
    this.scene.tweens.add({ targets: this.root, y: 7, duration: 45, yoyo: true, ease: 'Quad.easeOut' });
    // 口がガバッと開く
    this.scene.tweens.add({ targets: this.mouth, scaleY: 1.7, scaleX: 1.12, duration: 70, yoyo: true, hold: 110, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: this.tag, angle: 10, duration: 120, yoyo: true, ease: 'Sine.easeInOut' });
    this.smoke.explode(9, this.outlet.x, this.outlet.y);

    this.hooks.onPull();
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id !== this.dragId) return;
    this.dragId = null;
    this.setStrain(false);
    this.scheduleHint();
  }

  setInputEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.dragId = null;
      this.setStrain(false);
    }
  }

  destroy() {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    this.idleTimer?.remove();
    this.blinkTimer?.remove();
    this.smoke.destroy();
    this.root.destroy();
  }
}

registerMachineView('crank', (scene, def, hooks, layout) => new HandCrankMachine(scene, def, hooks, layout));
