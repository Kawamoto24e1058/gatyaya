// バイト「金魚すくい」：指で押さえるとポイが水に入り、離すとすくい上げる。
// 水に入れている間ポイは弱っていき、破れたら少し待って新しいポイ。金色の金魚は大当たり。
import Phaser from 'phaser';
import { CSS, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { comboLabel, makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

type Kind = 'red' | 'black' | 'gold';
const KINDS: Record<Kind, { color: number; pay: number; speed: number; size: number }> = {
  red: { color: 0xe0503c, pay: 2, speed: 90, size: 1 },
  black: { color: 0x2c2230, pay: 4, speed: 130, size: 1.15 },
  gold: { color: 0xf2c94c, pay: 25, speed: 190, size: 1.1 },
};
const POOL = { x: 50, y: 330 + OY, w: GAME_W - 100, h: 640 };
const POI_R = 74;
// 水に入れている間に弱る速さ（1 秒あたり）。動かすと余計に弱る
const WEAR = 0.45;
// TODO(balance)
const BONUS_FISH = 12;

type Fish = { kind: Kind; obj: Phaser.GameObjects.Container; vx: number; vy: number; turnIn: number };

export class GoldfishGame implements MiniGame {
  readonly id = 'goldfish';
  readonly name = '金魚すくい';
  readonly durationSec = 35;

  private scene!: Phaser.Scene;
  private fish: Fish[] = [];
  private poi!: Phaser.GameObjects.Container;
  private poiPaper!: Phaser.GameObjects.Graphics;
  private dipping = false;
  private health = 1;
  private broken = 0;
  private caught = 0;
  private golds = 0;
  private coins = 0;
  private streak = 0;
  private lastX = 0;
  private lastY = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private infoText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    const g = scene.add.graphics();
    drawPlate(g, POOL.x - 12, POOL.y - 12, POOL.w + 24, POOL.h + 24, 0x3a6fa8, { radius: 40, shadow: 8, outline: 6, shine: false });
    g.fillStyle(0x5a9ad0, 1);
    g.fillRoundedRect(POOL.x, POOL.y, POOL.w, POOL.h, 30);
    g.fillStyle(0xffffff, 0.08);
    for (let i = 0; i < 7; i++) g.fillEllipse(POOL.x + 80 + i * 85, POOL.y + 60 + (i % 3) * 200, 120, 18);
    this.comboText = comboLabel(scene, POOL.y - 60);
    this.infoText = txt(scene, 360, POOL.y + POOL.h + 50, '', 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    txt(scene, 360, POOL.y + POOL.h + 100, '押さえてポイを沈め、金魚の上で離してすくう', 22, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    for (let i = 0; i < 9; i++) this.spawnFish();
    this.makePoi();
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    this.refresh();
  }

  private makePoi() {
    const s = this.scene;
    this.poi = s.add.container(360, POOL.y + POOL.h / 2).setDepth(300).setAlpha(0.55);
    const frame = s.add.graphics();
    frame.lineStyle(10, PAL.vermilion, 1);
    frame.strokeCircle(0, 0, POI_R);
    frame.fillStyle(PAL.vermilion, 1);
    frame.fillRoundedRect(-8, POI_R - 4, 16, 110, 6);
    this.poiPaper = s.add.graphics();
    this.poi.add([this.poiPaper, frame]);
    this.drawPaper();
  }

  private drawPaper() {
    const g = this.poiPaper;
    g.clear();
    if (this.health <= 0) return;
    g.fillStyle(0xffffff, 0.25 + this.health * 0.45);
    g.fillCircle(0, 0, POI_R - 4);
    // 弱ってくると破れ目が見える
    if (this.health < 0.5) {
      g.lineStyle(3, PAL.ink, 0.4);
      g.lineBetween(-30, -10, 10, 20);
      if (this.health < 0.25) g.lineBetween(5, -35, 30, 5);
    }
  }

  private spawnFish(kind?: Kind) {
    const k: Kind = kind ?? (Math.random() < 0.05 ? 'gold' : Math.random() < 0.28 ? 'black' : 'red');
    const def = KINDS[k];
    const s = this.scene;
    const c = s.add.container(Phaser.Math.Between(POOL.x + 60, POOL.x + POOL.w - 60), Phaser.Math.Between(POOL.y + 60, POOL.y + POOL.h - 60));
    const g = s.add.graphics();
    g.fillStyle(def.color, 1);
    g.fillEllipse(0, 0, 54, 32);
    g.fillTriangle(-24, 0, -48, -16, -48, 16);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(14, -5, 5);
    g.fillStyle(PAL.ink, 1);
    g.fillCircle(15, -5, 2.5);
    if (k === 'gold') {
      g.lineStyle(3, 0xffffff, 0.8);
      g.strokeEllipse(0, 0, 54, 32);
    }
    c.add(g);
    c.setScale(def.size);
    const a = Math.random() * Math.PI * 2;
    this.fish.push({ kind: k, obj: c, vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed, turnIn: Math.random() * 1.5 });
  }

  update(dt: number): void {
    for (const f of this.fish) {
      f.turnIn -= dt;
      if (f.turnIn <= 0) {
        const sp = KINDS[f.kind].speed * (0.6 + Math.random() * 0.8);
        const a = Math.random() * Math.PI * 2;
        f.vx = Math.cos(a) * sp;
        f.vy = Math.sin(a) * sp;
        f.turnIn = 0.6 + Math.random() * 1.6;
      }
      // ポイが沈んでいると逃げる
      if (this.dipping) {
        const dx = f.obj.x - this.poi.x;
        const dy = f.obj.y - this.poi.y;
        const d = Math.hypot(dx, dy);
        if (d < 160 && d > 1) {
          f.vx += (dx / d) * 160 * dt;
          f.vy += (dy / d) * 160 * dt;
        }
      }
      f.obj.x += f.vx * dt;
      f.obj.y += f.vy * dt;
      if (f.obj.x < POOL.x + 30 || f.obj.x > POOL.x + POOL.w - 30) f.vx *= -1;
      if (f.obj.y < POOL.y + 30 || f.obj.y > POOL.y + POOL.h - 30) f.vy *= -1;
      f.obj.x = Phaser.Math.Clamp(f.obj.x, POOL.x + 30, POOL.x + POOL.w - 30);
      f.obj.y = Phaser.Math.Clamp(f.obj.y, POOL.y + 30, POOL.y + POOL.h - 30);
      f.obj.setRotation(Math.atan2(f.vy, f.vx));
    }
    if (this.dipping && this.health > 0) {
      const moved = Math.hypot(this.poi.x - this.lastX, this.poi.y - this.lastY);
      this.health -= WEAR * dt + moved * 0.0012;
      this.lastX = this.poi.x;
      this.lastY = this.poi.y;
      this.drawPaper();
      if (this.health <= 0) this.tear();
    }
  }

  private tear() {
    this.dipping = false;
    this.broken += 1;
    this.streak = 0;
    this.comboText.setText('');
    sfx.play('buzz', { vol: 0.5 });
    popText(this.scene, this.poi.x, this.poi.y - 90, 'ポイが破れた！', CSS.bad);
    this.poi.setAlpha(0.25);
    this.scene.time.delayedCall(900, () => {
      this.health = 1;
      this.drawPaper();
      this.poi.setAlpha(0.55);
      sfx.play('pop', { rate: 1.3, vol: 0.5 });
    });
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.health <= 0) return;
    this.poi.setPosition(p.worldX, p.worldY);
    this.lastX = p.worldX;
    this.lastY = p.worldY;
    this.dipping = true;
    this.poi.setAlpha(0.9).setScale(0.95);
    sfx.play('whoosh', { rate: 1.6, vol: 0.3 });
  }

  private onMove(p: Phaser.Input.Pointer) {
    this.poi.setPosition(Phaser.Math.Clamp(p.worldX, POOL.x, POOL.x + POOL.w), Phaser.Math.Clamp(p.worldY, POOL.y, POOL.y + POOL.h));
  }

  private onUp() {
    if (!this.dipping) return;
    this.dipping = false;
    this.poi.setAlpha(0.55).setScale(1);
    const got = this.fish.filter((f) => Math.hypot(f.obj.x - this.poi.x, f.obj.y - this.poi.y) < POI_R - 10);
    if (got.length === 0) {
      sfx.play('tap', { rate: 0.7 });
      return;
    }
    for (const f of got) {
      this.fish = this.fish.filter((x) => x !== f);
      this.caught += 1;
      this.streak += 1;
      const gain = KINDS[f.kind].pay + Math.floor(this.streak / 6);
      this.coins += gain;
      if (f.kind === 'gold') {
        this.golds += 1;
        sfx.play('fanfare');
        stamp(this.scene, 360, POOL.y + 120, '金の金魚！', 54, CSS.gold, { hold: 400, depth: 900 });
        this.sparks.explode(30, f.obj.x, f.obj.y);
      } else {
        sfx.play('sparkle', { rate: 1 + Math.min(this.streak, 8) * 0.05, vol: 0.7 });
        this.sparks.explode(8, f.obj.x, f.obj.y);
      }
      popText(this.scene, f.obj.x, f.obj.y - 40, `+${gain}`, f.kind === 'gold' ? CSS.gold : CSS.cream);
      this.scene.tweens.add({ targets: f.obj, y: f.obj.y - 120, scale: 0.4, alpha: 0, duration: 380, onComplete: () => f.obj.destroy() });
      this.scene.time.delayedCall(700, () => this.spawnFish());
    }
    vibrate(12);
    // すくい上げるとポイも少し弱る
    this.health -= 0.12 * got.length;
    this.drawPaper();
    if (this.health <= 0) this.tear();
    this.comboText.setText(this.streak >= 3 ? `${this.streak} 匹連続` : '');
    this.refresh();
  }

  private refresh() {
    this.infoText.setText(`すくった ${this.caught} 匹 ／ 破れたポイ ${this.broken}`);
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.destroy();
    const bonus: Reward | undefined = this.caught >= BONUS_FISH ? { kind: 'sellBonusWeek', amount: 0.05 } : undefined;
    return { coins: this.coins, bonus, summary: `すくった ${this.caught} 匹${this.golds ? `（金 ${this.golds}）` : ''}` };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
  }
}

export const GOLDFISH_BONUS = BONUS_FISH;
