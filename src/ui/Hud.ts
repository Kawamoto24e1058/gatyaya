// 上部 HUD：日付・返済までの日数・コイン・AP・ノルマ。1 秒で状況がわかることを優先。
import Phaser from 'phaser';
import { CSS, GAME_W } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { S, daysUntilPayday, storeMuted } from '../game/state';
import { txt } from './widgets';

export class Hud extends Phaser.GameObjects.Container {
  private dayText: Phaser.GameObjects.Text;
  private payText: Phaser.GameObjects.Text;
  private coinText: Phaser.GameObjects.Text;
  private quotaText: Phaser.GameObjects.Text;
  private quotaBar: Phaser.GameObjects.Graphics;
  private apPips: Phaser.GameObjects.Graphics;
  private muteText: Phaser.GameObjects.Text;
  private shownCoins: number;
  private coinTween?: Phaser.Tweens.Tween;
  readonly coinIcon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    const bg = scene.add.graphics();
    bg.fillStyle(0x1b1430, 0.92);
    bg.fillRect(0, 0, GAME_W, 118);
    bg.fillStyle(0xffffff, 0.06);
    bg.fillRect(0, 114, GAME_W, 4);

    this.dayText = txt(scene, 24, 34, '', 36, { originX: 0 });
    this.payText = txt(scene, 24, 82, '', 24, { originX: 0, color: CSS.sub });

    this.coinIcon = scene.add.image(440, 36, 'coin').setScale(0.9);
    this.coinText = txt(scene, 470, 36, '', 40, { originX: 0, color: CSS.gold });
    this.shownCoins = S().coins;

    this.apPips = scene.add.graphics();
    this.quotaBar = scene.add.graphics();
    this.quotaText = txt(scene, 420, 82, '', 22, { originX: 0, color: CSS.sub, bold: false });

    this.muteText = txt(scene, GAME_W - 30, 36, '', 30);
    this.muteText.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx.setMuted(!sfx.muted);
      storeMuted(sfx.muted);
      this.refresh(false);
    });

    this.add([bg, this.dayText, this.payText, this.coinIcon, this.coinText, this.apPips, this.quotaBar, this.quotaText, this.muteText]);
    this.setDepth(500);
    scene.add.existing(this);
    this.refresh(false);
  }

  refresh(animate = true) {
    const s = S();
    this.dayText.setText(`${s.day}日目`);
    const d = daysUntilPayday(s);
    this.payText.setText(d === 0 ? '今日が返済日！' : `返済まで あと${d}日`);
    this.payText.setColor(d === 0 ? CSS.bad : d <= 2 ? CSS.gold : CSS.sub);

    if (animate && this.shownCoins !== s.coins) {
      this.coinTween?.stop();
      const o = { v: this.shownCoins };
      const up = s.coins > this.shownCoins;
      this.coinTween = this.scene.tweens.add({
        targets: o,
        v: s.coins,
        duration: 450,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          this.shownCoins = Math.round(o.v);
          this.coinText.setText(fmt(this.shownCoins));
        },
      });
      this.scene.tweens.add({ targets: [this.coinText, this.coinIcon], scale: up ? 1.15 : 0.92, duration: 80, yoyo: true });
    } else if (!this.coinTween?.isPlaying()) {
      this.shownCoins = s.coins;
      this.coinText.setText(fmt(s.coins));
    }

    // AP：●で表示
    const g = this.apPips;
    g.clear();
    const x0 = 250;
    const y = 82;
    for (let i = 0; i < s.apMax; i++) {
      const filled = i < s.ap;
      g.fillStyle(filled ? 0x4fd18b : 0xffffff, filled ? 1 : 0.15);
      g.fillCircle(x0 + i * 26, y, 10);
    }
    // ノルマ進捗バー
    const ratio = Math.min(1, s.coins / s.quota);
    const qb = this.quotaBar;
    qb.clear();
    qb.fillStyle(0xffffff, 0.12);
    qb.fillRoundedRect(420, 100, 270, 8, 4);
    qb.fillStyle(ratio >= 1 ? 0x4fd18b : 0xffc531, 1);
    qb.fillRoundedRect(420, 100, Math.max(8, 270 * ratio), 8, 4);
    this.quotaText.setText(`返済 ${fmt(s.quota)}`);
    this.quotaText.setY(80);

    this.muteText.setText(sfx.muted ? '🔇' : '🔊');
  }

  /** 画面座標でのコイン表示位置（コインが飛んでいく先） */
  coinTarget(): { x: number; y: number } {
    return { x: this.coinIcon.x, y: this.coinIcon.y };
  }
}
