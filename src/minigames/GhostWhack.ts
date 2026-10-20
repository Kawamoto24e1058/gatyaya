// バイト「お化け払い」：棚の陰から顔を出すお化けをタップで払う。お客さんを叩くとクレーム。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { comboLabel, makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

const COLS = 3;
const ROWS = 3;
const HOLE_X = [160, 360, 560];
const HOLE_Y = [470 + OY, 690 + OY, 910 + OY];
// TODO(balance)
const BONUS_GHOSTS = 20;

type Kind = 'ghost' | 'gold' | 'customer';
type Pop = { kind: Kind; obj: Phaser.GameObjects.Container; life: number; hit: boolean };

export class GhostWhackGame implements MiniGame {
  readonly id = 'ghost-whack';
  readonly name = 'お化け払い';
  readonly durationSec = 30;

  private scene!: Phaser.Scene;
  private holes: (Pop | null)[] = new Array(COLS * ROWS).fill(null);
  private spawnIn = 0.5;
  private elapsed = 0;
  private ghosts = 0;
  private claims = 0;
  private streak = 0;
  private coins = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private countText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    const g = scene.add.graphics();
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = HOLE_X[i % COLS];
      const y = HOLE_Y[Math.floor(i / COLS)];
      // 棚の穴（暗がり）
      drawPlate(g, x - 92, y - 70, 184, 150, PAL.woodDark, { radius: 12, shadow: 6, outline: 5, shine: false });
      g.fillStyle(PAL.night, 1);
      g.fillRoundedRect(x - 76, y - 56, 152, 122, 10);
    }
    this.comboText = comboLabel(scene, 340 + OY);
    this.countText = txt(scene, 360, 1060 + OY, '払った 0 匹', 32, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    txt(scene, 360, 1120 + OY, 'お化けをタップ！ お客さんは叩かないで', 24, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    scene.input.on('pointerdown', this.onTap, this);
  }

  private makeFace(kind: Kind): Phaser.GameObjects.Container {
    const s = this.scene;
    const c = s.add.container(0, 0);
    const g = s.add.graphics();
    if (kind === 'customer') {
      // お客さん：帽子の子ども
      g.fillStyle(PAL.ink, 1);
      g.fillCircle(3, 4, 46);
      g.fillStyle(0xf2c9a0, 1);
      g.fillCircle(0, 0, 42);
      g.fillStyle(PAL.teal, 1);
      g.fillRoundedRect(-46, -46, 92, 30, 12);
      g.fillStyle(PAL.ink, 1);
      g.fillCircle(-14, 4, 5);
      g.fillCircle(14, 4, 5);
      g.lineStyle(4, PAL.ink, 1);
      g.beginPath();
      g.arc(0, 14, 12, 0.2, Math.PI - 0.2);
      g.strokePath();
    } else {
      // お化け（金のお化けはボーナス）
      const body = kind === 'gold' ? PAL.mustard : PAL.ghost;
      g.fillStyle(PAL.ink, 1);
      g.fillCircle(3, -2, 48);
      g.fillRect(-45, -2, 96, 54);
      g.fillStyle(body, 1);
      g.fillCircle(0, -6, 44);
      g.fillRect(-44, -6, 88, 50);
      for (let i = 0; i < 4; i++) g.fillTriangle(-44 + i * 22, 44, -22 + i * 22, 44, -33 + i * 22, 58);
      g.fillStyle(PAL.ink, 1);
      g.fillEllipse(-15, -8, 12, 18);
      g.fillEllipse(15, -8, 12, 18);
      g.fillStyle(PAL.vermilion, 1);
      g.fillEllipse(0, 18, 18, 12);
    }
    c.add(g);
    return c;
  }

  update(dt: number): void {
    this.elapsed += dt;
    for (let i = 0; i < this.holes.length; i++) {
      const p = this.holes[i];
      if (!p || p.hit) continue;
      p.life -= dt;
      if (p.life <= 0) this.retract(i, false);
    }
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      // だんだん忙しく
      const pace = Math.max(0.28, 0.75 - this.elapsed * 0.016);
      this.spawnIn = pace * (0.7 + Math.random() * 0.6);
      this.spawn();
    }
  }

  private spawn() {
    const free = this.holes.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
    if (free.length === 0) return;
    const i = free[Math.floor(Math.random() * free.length)];
    const r = Math.random();
    const kind: Kind = r < 0.22 ? 'customer' : r < 0.3 ? 'gold' : 'ghost';
    const x = HOLE_X[i % COLS];
    const y = HOLE_Y[Math.floor(i / COLS)];
    const obj = this.makeFace(kind);
    obj.setPosition(x, y + 60).setScale(0.3).setAlpha(0);
    this.scene.tweens.add({ targets: obj, y, scale: 1, alpha: 1, duration: 130, ease: 'Back.easeOut' });
    const life = Math.max(0.55, 1.1 - this.elapsed * 0.015) * (kind === 'gold' ? 0.7 : 1);
    this.holes[i] = { kind, obj, life, hit: false };
  }

  private retract(i: number, hit: boolean) {
    const p = this.holes[i];
    if (!p) return;
    p.hit = true;
    const y = HOLE_Y[Math.floor(i / COLS)];
    this.scene.tweens.add({
      targets: p.obj,
      y: y + (hit ? -30 : 60),
      scale: hit ? 1.3 : 0.3,
      alpha: 0,
      angle: hit ? Phaser.Math.Between(-30, 30) : 0,
      duration: hit ? 200 : 140,
      onComplete: () => {
        p.obj.destroy();
        if (this.holes[i] === p) this.holes[i] = null;
      },
    });
  }

  private onTap(ptr: Phaser.Input.Pointer) {
    for (let i = 0; i < this.holes.length; i++) {
      const p = this.holes[i];
      if (!p || p.hit) continue;
      const x = HOLE_X[i % COLS];
      const y = HOLE_Y[Math.floor(i / COLS)];
      if (Math.abs(ptr.worldX - x) > 92 || Math.abs(ptr.worldY - y) > 80) continue;
      if (p.kind === 'customer') {
        this.claims += 1;
        this.streak = 0;
        this.coins = Math.max(0, this.coins - 3);
        sfx.play('buzz');
        vibrate(30);
        this.scene.cameras.main.shake(160, 0.006);
        popText(this.scene, x, y - 70, 'クレーム！ -3', CSS.bad);
      } else {
        this.ghosts += 1;
        this.streak += 1;
        const gain = (p.kind === 'gold' ? 5 : 1) + Math.floor(this.streak / 6);
        this.coins += gain;
        sfx.play(p.kind === 'gold' ? 'sparkle' : 'pop', { rate: 1 + Math.min(this.streak, 12) * 0.04 });
        vibrate(8);
        this.sparks.explode(p.kind === 'gold' ? 14 : 6, x, y);
        popText(this.scene, x, y - 70, `+${gain}`, p.kind === 'gold' ? CSS.gold : CSS.cream);
        if (this.streak % 10 === 0) stamp(this.scene, 360, 380 + OY, `${this.streak}連続！`, 52, CSS.gold, { hold: 400 });
      }
      this.retract(i, true);
      this.comboText.setText(this.streak >= 3 ? `${this.streak} 連続` : '');
      this.countText.setText(`払った ${this.ghosts} 匹`);
      return;
    }
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.destroy();
    const bonus: Reward | undefined = this.ghosts >= BONUS_GHOSTS && this.claims <= 2 ? { kind: 'nightBoost' } : undefined;
    return { coins: this.coins, bonus, summary: `払った ${this.ghosts} 匹 / クレーム ${this.claims}` };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onTap, this);
  }
}

export const GHOST_BONUS = BONUS_GHOSTS;
