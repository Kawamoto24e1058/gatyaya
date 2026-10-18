// バイト「提灯の火入れ」：長押しで火を育て、目盛りの帯に入ったところで指を離す。帯は 1 回ごとに動く。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { comboLabel, makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

const GAUGE = { x: 600, top: 380 + OY, h: 560, w: 56 };
const LANTERN = { x: 300, y: 640 + OY };
// TODO(balance)
const BONUS_LIT = 10;

export class LanternGame implements MiniGame {
  readonly id = 'lantern';
  readonly name = '提灯の火入れ';
  readonly durationSec = 30;

  private scene!: Phaser.Scene;
  private holding = false;
  private level = 0; // 0〜1
  private speed = 0.7;
  private band = { lo: 0.55, hi: 0.75 };
  private lit = 0;
  private perfects = 0;
  private fails = 0;
  private streak = 0;
  private coins = 0;
  private cooldown = 0;
  private gauge!: Phaser.GameObjects.Graphics;
  private flame!: Phaser.GameObjects.Graphics;
  private lantern!: Phaser.GameObjects.Container;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private countText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    const frame = scene.add.graphics();
    drawPlate(frame, GAUGE.x - GAUGE.w / 2 - 10, GAUGE.top - 10, GAUGE.w + 20, GAUGE.h + 20, PAL.woodDark, { radius: 14, shadow: 6, outline: 5, shine: false });
    this.gauge = scene.add.graphics();
    this.lantern = this.makeLantern();
    this.flame = scene.add.graphics();
    this.comboText = comboLabel(scene, 300 + OY);
    this.countText = txt(scene, 360, 1040 + OY, '灯した 0 個', 32, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    txt(scene, 360, 1100 + OY, '長押しで火を育て、黄色い帯で離す！', 24, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    this.newBand();
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  private makeLantern() {
    const s = this.scene;
    const c = s.add.container(LANTERN.x, LANTERN.y);
    const g = s.add.graphics();
    g.fillStyle(PAL.ink, 1);
    g.fillRect(-60, -170, 120, 26);
    g.fillRect(-60, 144, 120, 26);
    g.fillEllipse(4, 4, 230, 300);
    g.fillStyle(PAL.vermilion, 1);
    g.fillEllipse(0, 0, 214, 284);
    g.lineStyle(4, PAL.ink, 0.45);
    for (let i = -3; i <= 3; i++) g.lineBetween(-Math.sqrt(1 - (i / 4) ** 2) * 107, i * 36, Math.sqrt(1 - (i / 4) ** 2) * 107, i * 36);
    c.add(g);
    c.add(txt(s, 0, 0, '福', 84, { color: CSS.ink }));
    return c;
  }

  private newBand() {
    const w = Math.max(0.09, 0.2 - this.lit * 0.008);
    const lo = 0.3 + Math.random() * (0.62 - w);
    this.band = { lo, hi: lo + w };
    this.speed = Math.min(1.5, 0.7 + this.lit * 0.05);
    this.level = 0;
    this.draw();
  }

  private draw() {
    const g = this.gauge;
    g.clear();
    const y = (v: number) => GAUGE.top + GAUGE.h * (1 - v);
    g.fillStyle(PAL.night, 1);
    g.fillRect(GAUGE.x - GAUGE.w / 2, GAUGE.top, GAUGE.w, GAUGE.h);
    g.fillStyle(PAL.mustard, 1);
    g.fillRect(GAUGE.x - GAUGE.w / 2, y(this.band.hi), GAUGE.w, (this.band.hi - this.band.lo) * GAUGE.h);
    g.fillStyle(0xffffff, 0.5);
    const mid = (this.band.lo + this.band.hi) / 2;
    g.fillRect(GAUGE.x - GAUGE.w / 2, y(mid) - 2, GAUGE.w, 4);
    // 火の高さ
    const col = this.level > this.band.hi ? PAL.blood : PAL.vermilion;
    g.fillStyle(col, 0.85);
    g.fillRect(GAUGE.x - GAUGE.w / 2 + 8, y(this.level), GAUGE.w - 16, this.level * GAUGE.h);
    // 提灯の中の火
    const f = this.flame;
    f.clear();
    if (this.level > 0) {
      const r = 20 + this.level * 70;
      f.fillStyle(PAL.mustard, 0.35 + this.level * 0.4);
      f.fillCircle(LANTERN.x, LANTERN.y, r);
      f.fillStyle(0xffffff, 0.25 + this.level * 0.3);
      f.fillCircle(LANTERN.x, LANTERN.y, r * 0.45);
    }
  }

  update(dt: number): void {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return;
    }
    if (!this.holding) return;
    this.level += this.speed * dt;
    if (this.level >= 1) {
      // 燃えすぎ
      this.holding = false;
      this.miss('燃えすぎ！');
      return;
    }
    if (Math.random() < 0.3) sfx.play('tick', { rate: 0.6 + this.level, vol: 0.15 });
    this.draw();
  }

  private onDown() {
    if (this.cooldown > 0) return;
    this.holding = true;
    sfx.play('charge', { vol: 0.4 });
  }

  private onUp() {
    if (!this.holding) return;
    this.holding = false;
    const { lo, hi } = this.band;
    if (this.level >= lo && this.level <= hi) {
      const mid = (lo + hi) / 2;
      const perfect = Math.abs(this.level - mid) <= (hi - lo) * 0.18;
      this.lit += 1;
      this.streak += 1;
      if (perfect) this.perfects += 1;
      const gain = (perfect ? 6 : 3) + Math.floor(this.streak / 4);
      this.coins += gain;
      sfx.play(perfect ? 'sparkle' : 'pop');
      vibrate(10);
      this.sparks.explode(perfect ? 18 : 8, LANTERN.x, LANTERN.y);
      popText(this.scene, LANTERN.x, LANTERN.y - 200, perfect ? `ちょうど！ +${gain}` : `+${gain}`, perfect ? CSS.gold : CSS.cream);
      this.scene.tweens.add({ targets: this.lantern, scale: { from: 1.12, to: 1 }, duration: 200 });
      if (this.lit % 5 === 0) stamp(this.scene, 360, 380 + OY, `${this.lit}個！`, 52, CSS.gold, { hold: 400 });
      this.comboText.setText(this.streak >= 2 ? `${this.streak} 連続` : '');
      this.countText.setText(`灯した ${this.lit} 個`);
      this.cooldown = 0.25;
      this.scene.time.delayedCall(250, () => this.newBand());
    } else {
      this.miss(this.level < lo ? '弱すぎ…' : '燃えすぎ！');
    }
  }

  private miss(label: string) {
    this.fails += 1;
    this.streak = 0;
    sfx.play('buzz', { vol: 0.6 });
    popText(this.scene, LANTERN.x, LANTERN.y - 200, label, CSS.bad);
    this.comboText.setText('');
    this.cooldown = 0.4;
    this.scene.tweens.add({ targets: this.lantern, angle: { from: -6, to: 0 }, duration: 300, ease: 'Elastic.easeOut' });
    this.scene.time.delayedCall(400, () => this.newBand());
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.destroy();
    const bonus: Reward | undefined = this.lit >= BONUS_LIT ? { kind: 'apTomorrow', amount: 1 } : undefined;
    return { coins: this.coins, bonus, summary: `灯した ${this.lit} 個（ちょうど ${this.perfects}）` };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointerup', this.onUp, this);
  }
}

export const LANTERN_BONUS_LIT = BONUS_LIT;
