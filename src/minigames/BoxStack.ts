// バイト「倉庫整理」：左右に動く箱をタップで落として、きれいに積み上げる。はみ出た分は切り落とされる。
import Phaser from 'phaser';
import { CSS, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { comboLabel, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

const BOX_H = 54;
const START_W = 280;
const FLOOR_Y = 1040 + OY;
const PERFECT = 8;
// TODO(balance)
const BONUS_BOXES = 12;
const BOX_COLORS = [0xc9a06a, 0xb68a54, 0xd4b07a];

type Box = { x: number; w: number; obj: Phaser.GameObjects.Container };

export class BoxStackGame implements MiniGame {
  readonly id = 'box-stack';
  readonly name = '倉庫整理';
  readonly durationSec = 30;

  private scene!: Phaser.Scene;
  private world!: Phaser.GameObjects.Container;
  private stack: Box[] = [];
  private moving?: Box;
  private dir = 1;
  private speed = 300;
  private placed = 0;
  private perfects = 0;
  private streak = 0;
  private coins = 0;
  private countText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.world = scene.add.container(0, 0);
    // 下へずらした箱が説明文に重ならないよう、床より下は隠す
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff).fillRect(0, 0, GAME_W, FLOOR_Y + 44);
    this.world.setMask(maskShape.createGeometryMask());
    // 床
    const floor = scene.add.graphics();
    drawPlate(floor, 120, FLOOR_Y, 480, 40, PAL.woodDark, { radius: 8, shadow: 6, outline: 5, shine: false });
    this.world.add(floor);
    this.comboText = comboLabel(scene, 300 + OY);
    this.countText = txt(scene, 360, FLOOR_Y + 110, '積んだ 0 箱', 32, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 }).setDepth(450);
    txt(scene, 360, FLOOR_Y + 170, 'タップで箱を落とす。ぴったり重ねよう！', 24, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }).setDepth(450);
    this.resetTower(false);
    scene.input.on('pointerdown', this.onTap, this);
  }

  private makeBox(x: number, y: number, w: number): Phaser.GameObjects.Container {
    const c = this.scene.add.container(x, y);
    const g = this.scene.add.graphics();
    const col = BOX_COLORS[this.stack.length % BOX_COLORS.length];
    drawPlate(g, -w / 2, -BOX_H / 2, w, BOX_H, col, { radius: 4, shadow: 0, outline: 4, shine: false });
    g.lineStyle(3, PAL.ink, 0.35);
    g.lineBetween(-w / 2 + 6, 0, w / 2 - 6, 0);
    g.fillStyle(PAL.paper, 1);
    if (w > 60) g.fillRect(-14, -BOX_H / 2 + 6, 28, 16);
    c.add(g);
    this.world.add(c);
    return c;
  }

  private topY() {
    return FLOOR_Y - BOX_H / 2 - this.stack.length * BOX_H;
  }

  private resetTower(collapse: boolean) {
    if (collapse) {
      for (const b of this.stack) {
        this.scene.tweens.add({ targets: b.obj, y: b.obj.y + 400, angle: Phaser.Math.Between(-60, 60), alpha: 0, duration: 500, onComplete: () => b.obj.destroy() });
      }
    }
    this.stack = [];
    this.world.y = 0;
    this.spawnMoving(START_W);
  }

  private spawnMoving(w: number) {
    const y = this.topY();
    this.dir = Math.random() < 0.5 ? 1 : -1;
    const x = this.dir > 0 ? 120 + w / 2 : GAME_W - 120 - w / 2;
    this.moving = { x, w, obj: this.makeBox(x, y, w) };
  }

  update(dt: number): void {
    const m = this.moving;
    if (!m) return;
    m.x += this.dir * this.speed * dt;
    const minX = 60 + m.w / 2;
    const maxX = GAME_W - 60 - m.w / 2;
    if (m.x < minX || m.x > maxX) {
      m.x = Phaser.Math.Clamp(m.x, minX, maxX);
      this.dir *= -1;
    }
    m.obj.x = m.x;
  }

  private onTap() {
    const m = this.moving;
    if (!m) return;
    this.moving = undefined;
    const below = this.stack[this.stack.length - 1];
    const baseX = below ? below.x : GAME_W / 2;
    const baseW = below ? below.w : 480;
    const offset = m.x - baseX;
    const overlap = (m.w + baseW) / 2 - Math.abs(offset);

    if (overlap <= 4) {
      // 外れ：箱が落ちて、山が崩れる
      sfx.play('buzz');
      this.scene.cameras.main.shake(200, 0.008);
      this.scene.tweens.add({ targets: m.obj, y: m.obj.y + 500, angle: 90 * Math.sign(offset || 1), duration: 500, onComplete: () => m.obj.destroy() });
      popText(this.scene, 360, 360 + OY, 'ドサッ…', CSS.bad);
      this.streak = 0;
      this.comboText.setText('');
      this.scene.time.delayedCall(350, () => this.resetTower(true));
      return;
    }

    let w = m.w;
    let x = m.x;
    const perfect = Math.abs(offset) <= PERFECT;
    if (perfect) {
      x = baseX;
      this.perfects += 1;
      this.streak += 1;
      sfx.play('snap', { rate: 0.8 + Math.min(this.streak, 10) * 0.05 });
      popText(this.scene, x, m.obj.y - 60 + this.world.y, 'ピタッ！', CSS.gold);
      this.coins += 3;
    } else {
      // はみ出た分を切り落とす
      w = Math.min(m.w, overlap);
      x = baseX + (offset > 0 ? 1 : -1) * ((baseW - w) / 2);
      if (below === undefined) x = m.x;
      const cutW = m.w - w;
      const cutX = offset > 0 ? x + w / 2 + cutW / 2 : x - w / 2 - cutW / 2;
      const cut = this.makeBox(cutX, m.obj.y, cutW);
      this.scene.tweens.add({ targets: cut, y: cut.y + 500, angle: 60 * Math.sign(offset), alpha: 0, duration: 600, onComplete: () => cut.destroy() });
      sfx.play('knock', { rate: 0.8 });
      this.streak = 0;
      this.coins += 1;
    }
    m.obj.destroy();
    const box = { x, w, obj: this.makeBox(x, this.topY(), w) };
    this.stack.push(box);
    this.placed += 1;
    vibrate(8);
    this.countText.setText(`積んだ ${this.placed} 箱`);
    this.comboText.setText(this.streak >= 2 ? `${this.streak} 連続ピタッ!` : '');
    if (this.placed % 10 === 0) stamp(this.scene, 360, 380 + OY, `${this.placed}箱！`, 52, CSS.gold, { hold: 400 });
    // 高くなったら下へずらして見せる
    const top = this.topY() + this.world.y;
    if (top < 420 + OY) this.scene.tweens.add({ targets: this.world, y: this.world.y + BOX_H * 3, duration: 250 });
    this.speed = Math.min(620, this.speed + 12);
    this.spawnMoving(w);
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.scene.input.off('pointerdown', this.onTap, this);
    const bonus: Reward | undefined = this.placed >= BONUS_BOXES ? { kind: 'jarCapacityWeek', amount: 2 } : undefined;
    return { coins: this.coins, bonus, summary: `積んだ ${this.placed} 箱（ピタッ ${this.perfects}）` };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onTap, this);
  }
}

export const STACK_BONUS_BOXES = BONUS_BOXES;
