// バイト「両替の仕分け」：落ちてくる硬貨を、金貨は左・銀貨は右・偽金は下へフリックして仕分ける。
import Phaser from 'phaser';
import { CSS, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { comboLabel, makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

type Kind = 'gold' | 'silver' | 'fake';
const CENTER = { x: GAME_W / 2, y: 560 + OY };
const BOX = { gold: { x: 110, y: 760 + OY }, silver: { x: GAME_W - 110, y: 760 + OY }, fake: { x: GAME_W / 2, y: 1040 + OY } };
// TODO(balance)
const BONUS_CORRECT = 25;

export class CoinSortGame implements MiniGame {
  readonly id = 'coin-sort';
  readonly name = '両替の仕分け';
  readonly durationSec = 30;

  private scene!: Phaser.Scene;
  private coin?: { kind: Kind; obj: Phaser.GameObjects.Container; t: number };
  private fallTime = 2.2;
  private correct = 0;
  private wrong = 0;
  private streak = 0;
  private coins = 0;
  private downAt: { x: number; y: number } | null = null;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    const g = scene.add.graphics();
    for (const [k, p] of Object.entries(BOX) as [Kind, { x: number; y: number }][]) {
      const col = k === 'gold' ? PAL.mustard : k === 'silver' ? 0xb8b2c2 : PAL.night;
      drawPlate(g, p.x - 90, p.y - 50, 180, 100, col, { radius: 14, shadow: 6, outline: 5, shine: false });
      txt(scene, p.x, p.y, k === 'gold' ? '金貨' : k === 'silver' ? '銀貨' : '偽金', 32, { color: k === 'fake' ? CSS.bad : CSS.ink, stroke: k === 'fake' ? CSS.ink : undefined, strokeThickness: k === 'fake' ? 5 : 0 });
    }
    // 矢印
    txt(scene, 230, 760 + OY, '←', 48, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    txt(scene, 490, 760 + OY, '→', 48, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    txt(scene, 360, 920 + OY, '↓', 48, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    this.comboText = comboLabel(scene, 330 + OY);
    this.scoreText = txt(scene, 360, 1150 + OY, '仕分け 0 枚', 30, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    this.spawn();
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  private spawn() {
    const r = Math.random();
    const kind: Kind = r < 0.15 ? 'fake' : r < 0.575 ? 'gold' : 'silver';
    const s = this.scene;
    const c = s.add.container(CENTER.x, CENTER.y - 220);
    const g = s.add.graphics();
    const face = kind === 'gold' ? PAL.mustard : kind === 'silver' ? 0xd2cdda : 0x4a3a4e;
    g.fillStyle(PAL.ink, 1);
    g.fillCircle(3, 5, 62);
    g.fillCircle(0, 0, 62);
    g.fillStyle(face, 1);
    g.fillCircle(0, 0, 55);
    g.lineStyle(5, PAL.ink, 0.4);
    g.strokeCircle(0, 0, 40);
    g.fillStyle(PAL.ink, 1);
    g.fillRect(-12, -12, 24, 24);
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(-22, -24, 24, 12);
    c.add(g);
    if (kind === 'fake') c.add(txt(s, 0, 32, '?', 30, { color: CSS.bad, stroke: CSS.ink, strokeThickness: 4 }));
    this.coin = { kind, obj: c, t: 0 };
    c.setScale(0.4);
    s.tweens.add({ targets: c, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  update(dt: number): void {
    const c = this.coin;
    if (!c) return;
    c.t += dt;
    c.obj.y = CENTER.y - 220 + (c.t / this.fallTime) * 400;
    c.obj.angle = Math.sin(c.t * 6) * 8;
    if (c.t >= this.fallTime) this.judge(null);
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.downAt = { x: p.worldX, y: p.worldY };
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (!this.downAt || !this.coin) return;
    const dx = p.worldX - this.downAt.x;
    const dy = p.worldY - this.downAt.y;
    this.downAt = null;
    if (Math.hypot(dx, dy) < 40) return;
    const dir: Kind = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'gold' : 'silver') : dy > 0 ? 'fake' : 'gold';
    if (Math.abs(dy) > Math.abs(dx) && dy < 0) return; // 上フリックは無視
    this.judge(dir);
  }

  private judge(dir: Kind | null) {
    const c = this.coin;
    if (!c) return;
    this.coin = undefined;
    const ok = dir === c.kind;
    const target = dir ? BOX[dir] : { x: c.obj.x, y: c.obj.y + 400 };
    this.scene.tweens.add({ targets: c.obj, x: target.x, y: target.y, scale: 0.4, alpha: ok ? 1 : 0.3, duration: 180, ease: 'Quad.easeIn', onComplete: () => c.obj.destroy() });
    if (ok) {
      this.correct += 1;
      this.streak += 1;
      this.coins += 1 + Math.floor(this.streak / 8);
      sfx.play('coin', { rate: 1 + Math.min(this.streak, 15) * 0.03, vol: 0.7 });
      vibrate(6);
      this.scene.time.delayedCall(180, () => this.sparks.explode(8, target.x, target.y));
      if (this.streak % 10 === 0) stamp(this.scene, 360, 420 + OY, `${this.streak}連続！`, 52, CSS.gold, { hold: 400 });
    } else {
      this.wrong += 1;
      this.streak = 0;
      sfx.play('buzz', { vol: 0.6 });
      popText(this.scene, 360, CENTER.y, dir ? 'ちがう！' : '見逃し…', CSS.bad);
      this.scene.cameras.main.shake(120, 0.004);
    }
    this.comboText.setText(this.streak >= 3 ? `${this.streak} 連続` : '');
    this.scoreText.setText(`仕分け ${this.correct} 枚`);
    // だんだん速く
    this.fallTime = Math.max(0.9, this.fallTime - 0.05);
    this.scene.time.delayedCall(120, () => this.spawn());
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.destroy();
    this.coin?.obj.destroy();
    this.coin = undefined;
    const bonus: Reward | undefined = this.correct >= BONUS_CORRECT ? { kind: 'coins', amount: Math.round(this.coins * 0.3) } : undefined;
    return { coins: this.coins, bonus, summary: `仕分け ${this.correct} 枚 / まちがい ${this.wrong}` };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointerup', this.onUp, this);
  }
}

export const COIN_BONUS_CORRECT = BONUS_CORRECT;
