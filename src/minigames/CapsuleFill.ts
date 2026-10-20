// バイト「カプセル詰め」：流れてくるカプセルの蓋を、タイミングよくタップして「パチッ」と閉める。
import Phaser from 'phaser';
import { CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { pick, vibrate } from '../core/util';
import type { Rarity } from '../data/rarity';
import { drawPlate, stamp, txt } from '../ui/widgets';
import type { MiniGame, Reward } from './types';

// 縦長端末では全体を画面中央へ寄せる
const OY = Math.round((GAME_H - 1280) / 2);
const BELT_Y = 780 + OY;
const ZONE_X = 360;
const ZONE_HALF = 46;
const PERFECT = 14;
const HEAD_Y = 560 + OY;
// TODO(balance): 報酬・速度は仮値
const BONUS_THRESHOLD = 20;

type Cup = {
  obj: Phaser.GameObjects.Container;
  lid: Phaser.GameObjects.Image;
  closed: boolean;
  judged: boolean;
};

export class CapsuleFillGame implements MiniGame {
  readonly id = 'capsule-fill';
  readonly name = 'カプセル詰め';
  readonly durationSec = 30;

  private scene!: Phaser.Scene;
  private cups: Cup[] = [];
  private elapsed = 0;
  private spawnIn = 0.6;
  private speed = 230;
  private closed = 0;
  private perfects = 0;
  private combo = 0;
  private maxCombo = 0;
  private coins = 0;
  private head!: Phaser.GameObjects.Container;
  private headLid!: Phaser.GameObjects.Image;
  private belt!: Phaser.GameObjects.TileSprite;
  private comboText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private nextLid: Rarity = 'N';

  start(scene: Phaser.Scene): void {
    this.scene = scene;

    // ベルトコンベア（脚つき）
    const frame = scene.add.graphics();
    frame.fillStyle(PAL.ink, 1);
    for (const lx of [80, 300, 520, 680]) frame.fillRect(lx, BELT_Y + 30, 18, 150);
    drawPlate(frame, -20, BELT_Y - 6, GAME_W + 40, 52, 0x5c4c60, { radius: 20, shadow: 8, outline: 5, shine: false });
    this.belt = scene.add.tileSprite(GAME_W / 2, BELT_Y + 20, GAME_W + 40, 44, 'belt');
    // ローラー
    const rollers = scene.add.graphics();
    for (let x = 30; x < GAME_W; x += 110) {
      rollers.fillStyle(PAL.ink, 1);
      rollers.fillCircle(x, BELT_Y + 20, 13);
      rollers.fillStyle(0xa79cb8, 1);
      rollers.fillCircle(x, BELT_Y + 20, 8);
    }

    // 判定ゾーン（ここ！）
    const zone = scene.add.graphics();
    zone.fillStyle(PAL.mustard, 0.16);
    zone.fillRoundedRect(ZONE_X - ZONE_HALF, HEAD_Y + 40, ZONE_HALF * 2, BELT_Y - HEAD_Y - 30, 10);
    zone.lineStyle(4, PAL.mustard, 0.9);
    zone.strokeRoundedRect(ZONE_X - ZONE_HALF, HEAD_Y + 40, ZONE_HALF * 2, BELT_Y - HEAD_Y - 30, 10);
    scene.tweens.add({ targets: zone, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });

    // プレス機（この子も付喪神）
    const post = scene.add.graphics();
    drawPlate(post, ZONE_X - 150, HEAD_Y - 200, 300, 70, PAL.vermilion, { radius: 18, shadow: 7, outline: 5 });
    post.fillStyle(PAL.ink, 1);
    post.fillRect(ZONE_X - 16, HEAD_Y - 130, 32, 110);
    post.fillStyle(0xa79cb8, 1);
    post.fillRect(ZONE_X - 9, HEAD_Y - 130, 18, 110);
    // 目
    for (const ex of [ZONE_X - 70, ZONE_X + 70]) {
      post.fillStyle(PAL.ink, 1);
      post.fillEllipse(ex, HEAD_Y - 166, 40, 34);
      post.fillStyle(0xfff8e8, 1);
      post.fillEllipse(ex, HEAD_Y - 166, 32, 26);
      post.fillStyle(PAL.ink, 1);
      post.fillCircle(ex, HEAD_Y - 160, 8);
    }
    this.head = scene.add.container(ZONE_X, HEAD_Y);
    const hg = scene.add.graphics();
    drawPlate(hg, -60, -44, 120, 40, 0x8a7f9a, { radius: 10, shadow: 0, outline: 5 });
    this.headLid = scene.add.image(0, 18, 'lid_N');
    this.head.add([hg, this.headLid]);

    this.comboText = txt(scene, 360, HEAD_Y - 290, '', 48, { color: CSS.gold, stroke: CSS.ink, strokeThickness: 9, shadow: true });
    const sc = scene.add.graphics();
    drawPlate(sc, 210, BELT_Y + 190, 300, 64, PAL.paper, { radius: 14, shadow: 6, outline: 5, shine: false });
    this.scoreText = txt(scene, 360, BELT_Y + 222, '詰めた数 0', 32, { color: CSS.ink });
    txt(scene, 360, BELT_Y + 300, 'カプセルが黄色い枠に来たらタップ！', 26, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });

    this.sparks = scene.add.particles(0, 0, 'spark', {
      emitting: false,
      speed: { min: 100, max: 300 },
      scale: { start: 0.8, end: 0 },
      lifespan: 400,
      gravityY: 600,
    });

    scene.input.on('pointerdown', this.onTap, this);
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.speed = 230 + this.elapsed * 9; // 徐々に速く
    this.belt.tilePositionX -= this.speed * dt;

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnCup();
      const minGap = 120 / this.speed;
      this.spawnIn = Math.max(minGap, Phaser.Math.FloatBetween(0.45, 1.0) * (230 / this.speed));
    }

    for (const c of this.cups) {
      c.obj.x += this.speed * dt;
      if (!c.judged && !c.closed && c.obj.x > ZONE_X + ZONE_HALF) {
        c.judged = true;
        c.obj.setAlpha(0.5);
        if (this.combo > 0) this.popText('スルー…', CSS.sub);
        this.combo = 0;
        this.updateCombo();
      }
    }
    this.cups = this.cups.filter((c) => {
      if (c.obj.x > GAME_W + 60) {
        c.obj.destroy();
        return false;
      }
      return true;
    });
  }

  private spawnCup() {
    const cup = this.scene.add.image(0, 0, 'cup').setOrigin(0.5, 0);
    const lid = this.scene.add.image(0, 0, 'lid_N').setOrigin(0.5, 1).setVisible(false);
    const obj = this.scene.add.container(-50, BELT_Y - 38, [cup, lid]);
    this.cups.push({ obj, lid, closed: false, judged: false });
  }

  private onTap() {
    // 連打でも取りこぼさないよう、前のプレス動作は打ち切って即座に下ろす
    this.scene.tweens.killTweensOf(this.head);
    this.head.y = HEAD_Y;
    this.scene.tweens.chain({
      targets: this.head,
      tweens: [
        { y: BELT_Y - 70, duration: 45, ease: 'Quad.easeIn' },
        { y: HEAD_Y, duration: 90, ease: 'Quad.easeOut' },
      ],
    });

    let best: Cup | null = null;
    let bestD = Infinity;
    for (const c of this.cups) {
      if (c.closed || c.judged) continue;
      const d = Math.abs(c.obj.x - ZONE_X);
      if (d <= ZONE_HALF && d < bestD) {
        best = c;
        bestD = d;
      }
    }

    if (!best) {
      sfx.play('buzz', { vol: 0.5 });
      this.combo = 0;
      this.updateCombo();
      this.popText('ミス', CSS.bad);
      this.scene.cameras.main.shake(60, 0.003);
      return;
    }

    const perfect = bestD <= PERFECT;
    best.closed = true;
    best.judged = true;
    best.lid.setTexture(`lid_${this.nextLid}`).setVisible(true);
    this.nextLid = pick<Rarity>(['N', 'N', 'R', 'SR']);
    this.headLid.setTexture(`lid_${this.nextLid}`);
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.closed += 1;
    if (perfect) this.perfects += 1;
    this.coins += (perfect ? 2 : 1) + Math.floor(this.combo / 10);

    sfx.play('snap', { rate: 1 + Math.min(this.combo, 20) * 0.025 + (perfect ? 0.05 : 0) });
    vibrate(8);
    this.sparks.explode(perfect ? 12 : 6, best.obj.x, BELT_Y - 40);
    this.scene.tweens.add({ targets: best.obj, scaleY: 0.85, duration: 50, yoyo: true });
    this.popText(perfect ? 'PERFECT!' : 'GOOD', perfect ? CSS.gold : CSS.good);
    if (this.combo % 10 === 0) {
      stamp(this.scene, 360, HEAD_Y - 220, `${this.combo}連鎖!!`, 56, CSS.gold, { hold: 500 });
      sfx.play('sparkle', { rate: 1.1 });
    }
    this.updateCombo();
    this.scoreText.setText(`詰めた数 ${this.closed}`);
  }

  private updateCombo() {
    this.comboText.setText(this.combo >= 2 ? `${this.combo} 連鎖！` : '');
    if (this.combo >= 2) {
      this.comboText.setScale(1.25);
      this.scene.tweens.add({ targets: this.comboText, scale: 1, duration: 120 });
    }
  }

  private popText(s: string, color: string) {
    const t = txt(this.scene, ZONE_X, BELT_Y - 120, s, 32, { color, stroke: CSS.ink, strokeThickness: 7 });
    this.scene.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.scene.input.off('pointerdown', this.onTap, this);
    const bonus: Reward | undefined = this.closed >= BONUS_THRESHOLD ? { kind: 'jarCapacityWeek', amount: 1 } : undefined;
    return {
      coins: this.coins,
      bonus,
      summary: `詰めた数 ${this.closed}（PERFECT ${this.perfects}）\n最大連鎖 ${this.maxCombo}`,
    };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onTap, this);
    this.cups = [];
  }
}

export const CAPSULE_FILL_BONUS_THRESHOLD = BONUS_THRESHOLD;
