// バイト「福引き当番」：ガラポン（八角の抽選器）を指でぐるぐる回す。1 周ごとに玉が 1 つ出て、色で賞金が決まる。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { jackpotFx } from '../ui/Jackpot';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

type Ball = { name: string; color: number; pay: number; weight: number };
// TODO(balance)：1 周あたりの期待値 約 4
const BALLS: Ball[] = [
  { name: '白', color: 0xf6f2ea, pay: 1, weight: 0.6 },
  { name: '赤', color: PAL.vermilion, pay: 3, weight: 0.25 },
  { name: '青', color: 0x3f7fd0, pay: 8, weight: 0.11 },
  { name: '金', color: PAL.mustard, pay: 25, weight: 0.035 },
  { name: '虹', color: 0xff66cc, pay: 200, weight: 0.005 },
];
const DRUM = { x: 360, y: 560 + OY, r: 170 };
const TRAY_Y = 900 + OY;
const MIN_INTERVAL = 800; // ms：速く回しても玉はこれより速く出ない
const BONUS_GOLD = 1;

export class GaraponGame implements MiniGame {
  readonly id = 'garapon';
  readonly name = '福引き当番';
  readonly durationSec = 20;

  private scene!: Phaser.Scene;
  private drum!: Phaser.GameObjects.Container;
  private dragId: number | null = null;
  private lastAngle = 0;
  private acc = 0;
  private lastBallAt = 0;
  private balls = 0;
  private golds = 0;
  private coins = 0;
  private tally: Record<string, number> = {};
  private trayX = 120;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private infoText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    // 台
    const base = scene.add.graphics();
    drawPlate(base, DRUM.x - 210, DRUM.y + 150, 420, 60, PAL.wood, { radius: 10, shadow: 6, outline: 5, shine: false });
    base.fillStyle(PAL.woodDark, 1);
    base.fillRect(DRUM.x - 14, DRUM.y, 28, 160);
    // 受け皿
    drawPlate(base, 60, TRAY_Y - 40, 600, 80, PAL.paper, { radius: 16, shadow: 6, outline: 5, shine: false });
    // 八角のドラム
    this.drum = scene.add.container(DRUM.x, DRUM.y);
    const g = scene.add.graphics();
    const pts = [...Array(8).keys()].map((i) => new Phaser.Math.Vector2(Math.cos((i * Math.PI) / 4 + Math.PI / 8) * DRUM.r, Math.sin((i * Math.PI) / 4 + Math.PI / 8) * DRUM.r));
    g.fillStyle(PAL.ink, 1);
    g.fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x + 6, p.y + 8)), true);
    g.fillStyle(PAL.vermilion, 1);
    g.fillPoints(pts, true);
    g.lineStyle(6, PAL.ink, 1);
    g.strokePoints(pts, true);
    g.lineStyle(4, PAL.mustard, 0.8);
    for (const p of pts) g.lineBetween(0, 0, p.x * 0.85, p.y * 0.85);
    g.fillStyle(PAL.mustard, 1);
    g.fillCircle(0, 0, 28);
    // 取っ手
    g.fillStyle(PAL.ink, 1);
    g.fillRect(DRUM.r - 10, -8, 70, 16);
    g.fillCircle(DRUM.r + 62, 0, 20);
    g.fillStyle(PAL.paper, 1);
    g.fillCircle(DRUM.r + 62, 0, 14);
    this.drum.add(g);
    this.drum.add(txt(scene, 0, 0, '福', 34, { color: CSS.ink }));

    // 賞金表
    const legend = BALLS.map((b) => `${b.name} ${b.pay}`).join('　');
    txt(scene, 360, DRUM.y - DRUM.r - 70, legend, 24, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    this.infoText = txt(scene, 360, TRAY_Y + 80, '', 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    txt(scene, 360, TRAY_Y + 130, 'ガラポンを指でぐるぐる回す。1 周で玉が 1 つ', 22, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    this.refresh();
  }

  private angleOf(p: Phaser.Input.Pointer) {
    return Math.atan2(p.worldY - DRUM.y, p.worldX - DRUM.x);
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (Math.hypot(p.worldX - DRUM.x, p.worldY - DRUM.y) > DRUM.r + 120) return;
    this.dragId = p.id;
    this.lastAngle = this.angleOf(p);
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.dragId) return;
    const a = this.angleOf(p);
    let d = a - this.lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.lastAngle = a;
    // どちら向きに回しても良い
    this.drum.rotation += d;
    this.acc += Math.abs(d);
    if (Math.abs(d) > 0.05 && Math.random() < 0.25) sfx.play('gari', { rate: 0.8 + Math.random() * 0.3, vol: 0.4 });
    if (this.acc >= Math.PI * 2) {
      this.acc -= Math.PI * 2;
      const now = this.scene.time.now;
      if (now - this.lastBallAt >= MIN_INTERVAL) {
        this.lastBallAt = now;
        this.drop();
      }
    }
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id === this.dragId) this.dragId = null;
  }

  private roll(): Ball {
    let r = Math.random();
    for (const b of BALLS) {
      if (r < b.weight) return b;
      r -= b.weight;
    }
    return BALLS[0];
  }

  private drop() {
    const b = this.roll();
    const s = this.scene;
    this.balls += 1;
    this.coins += b.pay;
    this.tally[b.name] = (this.tally[b.name] ?? 0) + 1;
    sfx.play('goton', { rate: 1.4 });
    const ball = s.add.circle(DRUM.x + DRUM.r * 0.4, DRUM.y + DRUM.r * 0.6, 22, b.color).setStrokeStyle(4, PAL.ink).setDepth(200);
    const tx = this.trayX;
    this.trayX = this.trayX >= 600 ? 120 : this.trayX + 48;
    s.tweens.add({
      targets: ball,
      x: tx,
      y: TRAY_Y,
      duration: 380,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        if (b.pay >= 200) jackpotFx(s, { heading: '虹玉！ 大当たり！', amount: b.pay, sub: '福引きの特賞！' });
        else if (b.pay >= 25) {
          this.golds += 1;
          sfx.play('fanfare', { vol: 0.8 });
          stamp(s, 360, DRUM.y - 40, '金玉！ 当たり！', 52, CSS.gold, { hold: 400, depth: 900 });
          this.sparks.explode(26, tx, TRAY_Y);
        } else {
          sfx.play(b.pay >= 8 ? 'sparkle' : 'pop', { vol: 0.6 });
          this.sparks.explode(6, tx, TRAY_Y);
        }
        popText(s, tx, TRAY_Y - 50, `+${b.pay}`, b.pay >= 8 ? CSS.gold : CSS.cream);
        vibrate(b.pay >= 25 ? 30 : 6);
        s.time.delayedCall(1600, () => ball.destroy());
      },
    });
    this.refresh();
  }

  private refresh() {
    this.infoText.setText(`玉 ${this.balls} 個 ／ ${this.coins} コイン`);
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.destroy();
    const bonus: Reward | undefined = this.golds >= BONUS_GOLD ? { kind: 'apTomorrow', amount: 1 } : undefined;
    const t = BALLS.filter((b) => this.tally[b.name]).map((b) => `${b.name}${this.tally[b.name]}`).join('・');
    return { coins: this.coins, bonus, summary: `玉 ${this.balls} 個（${t || 'なし'}）` };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
  }
}

export const GARAPON_BONUS_GOLD = BONUS_GOLD;
