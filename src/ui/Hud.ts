// 上部 HUD：日めくり・返済までの日数・AP（提灯）・コイン・返済ノルマ。1 秒で状況がわかることを優先。
import Phaser from 'phaser';
import { CSS, GAME_W, HUD_H, PAL, SAFE_TOP } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { S, daysUntilPayday, storeMuted } from '../game/state';
import { drawPlate, txt } from './widgets';

export class Hud extends Phaser.GameObjects.Container {
  private weekText: Phaser.GameObjects.Text;
  private dayText: Phaser.GameObjects.Text;
  private payText: Phaser.GameObjects.Text;
  private coinText: Phaser.GameObjects.Text;
  private quotaText: Phaser.GameObjects.Text;
  private quotaBar: Phaser.GameObjects.Graphics;
  private apIcons: Phaser.GameObjects.Image[] = [];
  private muteText: Phaser.GameObjects.Text;
  private shownCoins: number;
  private coinTween?: Phaser.Tweens.Tween;
  private lastAp = -1;
  readonly coinIcon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, SAFE_TOP);
    const bg = scene.add.graphics();
    // 木の看板帯（ノッチ部分も同じ色で塗る）
    bg.fillStyle(PAL.woodDark, 1);
    bg.fillRect(0, -SAFE_TOP, GAME_W, HUD_H + SAFE_TOP);
    for (let x = 0; x < GAME_W; x += 120) {
      bg.fillStyle(0x000000, 0.12);
      bg.fillRect(x, -SAFE_TOP, 2, HUD_H + SAFE_TOP);
    }
    bg.fillStyle(0xffffff, 0.06);
    bg.fillRect(0, 0, GAME_W, 4);
    bg.fillStyle(PAL.ink, 1);
    bg.fillRect(0, HUD_H - 6, GAME_W, 6);

    // 日めくり
    const cal = scene.add.graphics();
    drawPlate(cal, 18, 14, 112, 100, PAL.paper, { radius: 10, shadow: 5, outline: 4, shine: false });
    cal.fillStyle(PAL.vermilion, 1);
    cal.fillRoundedRect(18, 14, 112, 28, { tl: 10, tr: 10, bl: 0, br: 0 });
    cal.fillStyle(PAL.ink, 1);
    cal.fillCircle(46, 14, 4);
    cal.fillCircle(102, 14, 4);
    this.weekText = txt(scene, 74, 28, '', 19, { color: CSS.cream });
    this.dayText = txt(scene, 74, 82, '', 46, { color: CSS.ink });

    this.payText = txt(scene, 150, 38, '', 26, { originX: 0, color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    for (let i = 0; i < 8; i++) {
      const ic = scene.add.image(162 + i * 34, 90, 'ap_on').setVisible(false);
      this.apIcons.push(ic);
    }

    // コイン
    const cp = scene.add.graphics();
    drawPlate(cp, 420, 16, 240, 56, PAL.night, { radius: 28, shadow: 4, outline: 4, shine: false });
    this.coinIcon = scene.add.image(450, 44, 'coin');
    this.coinText = txt(scene, 646, 44, '', 38, { originX: 1, color: CSS.gold, stroke: CSS.ink, strokeThickness: 6 });
    this.shownCoins = S().coins;

    // 返済ノルマ（借用書の紙帯）
    this.quotaBar = scene.add.graphics();
    this.quotaText = txt(scene, 432, 99, '', 19, { originX: 0, color: CSS.ink });

    this.muteText = txt(scene, 690, 44, '', 28);
    this.muteText.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx.setMuted(!sfx.muted);
      storeMuted(sfx.muted);
      this.refresh(false);
    });

    this.add([bg, cal, this.weekText, this.dayText, this.payText, ...this.apIcons, cp, this.coinIcon, this.coinText, this.quotaBar, this.quotaText, this.muteText]);
    this.setDepth(500);
    scene.add.existing(this);
    this.refresh(false);
  }

  refresh(animate = true) {
    const s = S();
    this.weekText.setText(`第${s.week}週`);
    this.dayText.setText(`${s.day}`);
    const d = daysUntilPayday(s);
    this.payText.setText(d === 0 ? '今日が返済日！' : `返済まで あと${d}日`);
    this.payText.setColor(d === 0 ? '#ff8a7a' : d <= 2 ? CSS.gold : CSS.cream);

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
      this.scene.tweens.add({ targets: [this.coinText, this.coinIcon], scale: up ? 1.18 : 0.9, duration: 80, yoyo: true });
    } else if (!this.coinTween?.isPlaying()) {
      this.shownCoins = s.coins;
      this.coinText.setText(fmt(s.coins));
    }

    // AP：提灯の灯り
    this.apIcons.forEach((ic, i) => {
      ic.setVisible(i < s.apMax);
      ic.setTexture(i < s.ap ? 'ap_on' : 'ap_off');
    });
    if (this.lastAp > s.ap && animate) {
      // 消えた提灯がふっと揺れる
      for (let i = s.ap; i < this.lastAp && i < this.apIcons.length; i++) {
        this.scene.tweens.add({ targets: this.apIcons[i], angle: 18, duration: 90, yoyo: true, repeat: 1 });
      }
    }
    this.lastAp = s.ap;

    // ノルマ進捗
    const ratio = Math.min(1, s.coins / s.quota);
    const qb = this.quotaBar;
    qb.clear();
    drawPlate(qb, 424, 84, 236, 30, PAL.paper, { radius: 6, shadow: 3, outline: 3, shine: false });
    qb.fillStyle(ratio >= 1 ? PAL.moss : PAL.mustard, 0.55);
    qb.fillRect(424, 84, 236 * ratio, 30);
    this.quotaText.setText(`返済 ${fmt(Math.min(s.coins, s.quota))} / ${fmt(s.quota)}`);

    this.muteText.setText(sfx.muted ? '🔇' : '🔊');
  }

  /** 画面座標でのコイン表示位置（コインが飛んでいく先） */
  coinTarget(): { x: number; y: number } {
    return { x: this.coinIcon.x, y: this.coinIcon.y + SAFE_TOP };
  }

  /** HUD の下端（画面座標） */
  static bottom(): number {
    return SAFE_TOP + HUD_H;
  }
}
