// バイト「カプセル詰め」：流れてくるカプセルの蓋を、タイミングよくタップして「パチッ」と閉める。
import Phaser from 'phaser';
import { CSS, GAME_W } from '../config';
import { sfx } from '../core/audio';
import { pick, vibrate } from '../core/util';
import type { Rarity } from '../data/rarity';
import { txt } from '../ui/widgets';
import type { MiniGame, Reward } from './types';

const BELT_Y = 780;
const ZONE_X = 360;
const ZONE_HALF = 46;
const PERFECT = 14;
const HEAD_Y = 560;
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

    // ベルトコンベア
    if (!scene.textures.exists('belt')) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0x4a3f66, 1);
      g.fillRect(0, 0, 64, 40);
      g.fillStyle(0x5c5277, 1);
      g.fillRect(0, 0, 30, 40);
      g.generateTexture('belt', 64, 40);
      g.destroy();
    }
    const frame = scene.add.graphics();
    frame.fillStyle(0x1b1430, 1);
    frame.fillRect(0, BELT_Y + 18, GAME_W, 30);
    this.belt = scene.add.tileSprite(GAME_W / 2, BELT_Y + 18, GAME_W, 40, 'belt');

    // 判定ゾーン
    const zone = scene.add.graphics();
    zone.fillStyle(0xffc531, 0.18);
    zone.fillRect(ZONE_X - ZONE_HALF, HEAD_Y + 40, ZONE_HALF * 2, BELT_Y - HEAD_Y);
    zone.lineStyle(3, 0xffc531, 0.6);
    zone.strokeRect(ZONE_X - ZONE_HALF, HEAD_Y + 40, ZONE_HALF * 2, BELT_Y - HEAD_Y);

    // プレス機
    const post = scene.add.graphics();
    post.fillStyle(0x5c5277, 1);
    post.fillRect(ZONE_X - 120, 380, 240, 40);
    post.fillRect(ZONE_X - 14, 400, 28, 120);
    this.head = scene.add.container(ZONE_X, HEAD_Y);
    const hg = scene.add.graphics();
    hg.fillStyle(0x7d7399, 1);
    hg.fillRoundedRect(-56, -40, 112, 40, 10);
    this.headLid = scene.add.image(0, 18, 'lid_N');
    this.head.add([hg, this.headLid]);

    this.comboText = txt(scene, 360, 300, '', 44, { color: CSS.gold, stroke: '#1b1430', strokeThickness: 8 });
    this.scoreText = txt(scene, 360, 960, '詰めた数 0', 32, { color: CSS.white });
    txt(scene, 360, 1040, 'カプセルが黄色い枠に来たらタップ！', 26, { color: CSS.sub, bold: false });

    this.sparks = scene.add.particles(0, 0, 'spark', {
      emitting: false,
      speed: { min: 100, max: 300 },
      scale: { start: 0.7, end: 0 },
      lifespan: 400,
      gravityY: 600,
      blendMode: Phaser.BlendModes.ADD,
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
    const t = txt(this.scene, ZONE_X, BELT_Y - 120, s, 30, { color, stroke: '#1b1430', strokeThickness: 6 });
    this.scene.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.scene.input.off('pointerdown', this.onTap, this);
    const bonus: Reward | undefined = this.closed >= BONUS_THRESHOLD ? { kind: 'jarCapacityWeek', amount: 1 } : undefined;
    return {
      coins: this.coins,
      bonus,
      summary: `詰めた数 ${this.closed}（PERFECT ${this.perfects}） / 最大連鎖 ${this.maxCombo}`,
    };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onTap, this);
    this.cups = [];
  }
}

export const CAPSULE_FILL_BONUS_THRESHOLD = BONUS_THRESHOLD;
