// バイト「梱包」：景品を包んだプチプチを、指でなぞって全部つぶす。1 枚つぶし切るごとに梱包完了。
import Phaser from 'phaser';
import { CSS, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { comboLabel, makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

const COLS = 6;
const ROWS = 7;
const R = 34;
const GAP = 78;
const X0 = GAME_W / 2 - ((COLS - 1) * GAP) / 2;
const Y0 = 420 + OY;
// TODO(balance)
const BONUS_SHEETS = 4;

export class BubbleWrapGame implements MiniGame {
  readonly id = 'bubble-wrap';
  readonly name = '梱包プチプチ';
  readonly durationSec = 30;

  private scene!: Phaser.Scene;
  private sheet?: Phaser.GameObjects.Container;
  private bubbles: { g: Phaser.GameObjects.Graphics; popped: boolean }[] = [];
  private left = 0;
  private sheets = 0;
  private popped = 0;
  private streak = 0;
  private lastPopAt = 0;
  private down = false;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sheetText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    this.comboText = comboLabel(scene, Y0 - 110);
    const sc = scene.add.graphics();
    drawPlate(sc, 210, Y0 + ROWS * GAP + 30, 300, 64, PAL.paper, { radius: 14, shadow: 6, outline: 5, shine: false });
    this.sheetText = txt(scene, 360, Y0 + ROWS * GAP + 62, '梱包 0 箱', 32, { color: CSS.ink });
    txt(scene, 360, Y0 + ROWS * GAP + 140, '指でなぞってプチプチを全部つぶそう！', 26, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    this.newSheet();
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  private newSheet() {
    const s = this.scene;
    const c = s.add.container(GAME_W + 400, 0);
    const bg = s.add.graphics();
    drawPlate(bg, X0 - 60, Y0 - 60, (COLS - 1) * GAP + 120, (ROWS - 1) * GAP + 120, 0xd8e8ec, { radius: 18, shadow: 8, outline: 5, shine: false });
    c.add(bg);
    this.bubbles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let q = 0; q < COLS; q++) {
        const g = s.add.graphics({ x: X0 + q * GAP, y: Y0 + r * GAP });
        this.drawBubble(g, false);
        c.add(g);
        this.bubbles.push({ g, popped: false });
      }
    }
    this.left = this.bubbles.length;
    this.sheet = c;
    s.tweens.add({ targets: c, x: 0, duration: 280, ease: 'Back.easeOut' });
    sfx.play('whoosh', { rate: 1.2 });
  }

  private drawBubble(g: Phaser.GameObjects.Graphics, popped: boolean) {
    g.clear();
    if (popped) {
      g.lineStyle(3, PAL.ink, 0.35);
      g.strokeCircle(0, 0, R - 6);
      g.lineBetween(-10, -6, 10, 6);
      return;
    }
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(0, 0, R);
    g.lineStyle(4, PAL.ink, 0.7);
    g.strokeCircle(0, 0, R);
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(-11, -12, 16, 10);
  }

  private tryPop(x: number, y: number) {
    if (!this.sheet || this.sheet.x !== 0) return;
    const q = Math.round((x - X0) / GAP);
    const r = Math.round((y - Y0) / GAP);
    if (q < 0 || q >= COLS || r < 0 || r >= ROWS) return;
    if (Math.hypot(x - (X0 + q * GAP), y - (Y0 + r * GAP)) > R + 6) return;
    const b = this.bubbles[r * COLS + q];
    if (b.popped) return;
    b.popped = true;
    this.drawBubble(b.g, true);
    this.left -= 1;
    this.popped += 1;
    const now = this.scene.time.now;
    this.streak = now - this.lastPopAt < 350 ? this.streak + 1 : 1;
    this.lastPopAt = now;
    sfx.play('snap', { rate: 1.3 + Math.random() * 0.4 + Math.min(this.streak, 20) * 0.02, vol: 0.7 });
    vibrate(4);
    this.sparks.explode(4, X0 + q * GAP, Y0 + r * GAP);
    this.scene.tweens.add({ targets: b.g, scale: { from: 1.25, to: 1 }, duration: 90 });
    this.comboText.setText(this.streak >= 6 ? `${this.streak} プチ!` : '');
    if (this.left === 0) this.finishSheet();
  }

  private finishSheet() {
    this.sheets += 1;
    this.sheetText.setText(`梱包 ${this.sheets} 箱`);
    sfx.play('pop', { rate: 1.1 });
    stamp(this.scene, 360, Y0 + 220, '梱包完了！', 50, CSS.gold, { hold: 300 });
    const old = this.sheet;
    this.sheet = undefined;
    if (old) this.scene.tweens.add({ targets: old, x: -GAME_W - 400, duration: 260, ease: 'Cubic.easeIn', onComplete: () => old.destroy() });
    this.scene.time.delayedCall(220, () => this.newSheet());
    popText(this.scene, 360, Y0 + 300, `+${this.sheetCoins()}`, CSS.gold);
  }

  private sheetCoins() {
    return 4;
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.down = true;
    this.tryPop(p.worldX, p.worldY);
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.down) return;
    // 指が速く動いても取りこぼさないよう、前の位置との間も調べる
    const steps = Math.max(1, Math.ceil(Math.hypot(p.worldX - p.prevPosition.x, p.worldY - p.prevPosition.y) / 20));
    for (let i = 1; i <= steps; i++) {
      this.tryPop(Phaser.Math.Linear(p.prevPosition.x, p.worldX, i / steps), Phaser.Math.Linear(p.prevPosition.y, p.worldY, i / steps));
    }
  }

  private onUp() {
    this.down = false;
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.detach();
    const coins = this.sheets * this.sheetCoins() + Math.floor(this.popped / 5);
    const bonus: Reward | undefined = this.sheets >= BONUS_SHEETS ? { kind: 'sellBonusWeek', amount: 0.05 } : undefined;
    return { coins, bonus, summary: `梱包 ${this.sheets} 箱 / つぶした ${this.popped} プチ` };
  }

  private detach() {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
  }

  destroy(): void {
    this.detach();
  }
}

export const BUBBLE_BONUS_SHEETS = BONUS_SHEETS;
