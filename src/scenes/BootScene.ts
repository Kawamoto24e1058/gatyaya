// タイトル。最初のタップで AudioContext を resume する（iOS 対策）。
import Phaser from 'phaser';
import { BOTTOM, CSS, GAME_H, PAL, SAFE_TOP } from '../config';
import { sfx } from '../core/audio';
import { RARITIES } from '../data/rarity';
import { clearSave, hasSave, loadMuted, loadSave, newGame, saveNow, setState } from '../game/state';
import { addLantern, addPeekingEyes, addWisps } from '../ui/Ambient';
import { capsuleKey, makeTextures } from '../ui/textures';
import { Button, drawPlate, title, txt } from '../ui/widgets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    makeTextures(this);
    sfx.init();
    sfx.setMuted(loadMuted());

    this.add.image(0, 0, 'bg_night').setOrigin(0);
    // 背景をゆっくり転がり落ちるカプセル
    for (let i = 0; i < 12; i++) {
      const img = this.add
        .image(Phaser.Math.Between(40, 680), Phaser.Math.Between(-600, GAME_H), capsuleKey(RARITIES[i % 5]))
        .setAlpha(0.35)
        .setScale(Phaser.Math.FloatBetween(0.8, 1.5));
      this.tweens.add({
        targets: img,
        y: img.y + GAME_H + 200,
        rotation: Phaser.Math.FloatBetween(-6, 6),
        duration: Phaser.Math.Between(10000, 17000),
        repeat: -1,
        onRepeat: () => (img.y = -100),
      });
    }
    addWisps(this, { x: 40, y: SAFE_TOP + 80, w: 640, h: GAME_H * 0.5 }, 3, 2);
    addLantern(this, 96, SAFE_TOP - 10, 1, 10);
    addLantern(this, 624, SAFE_TOP + 10, 0.85, 10);

    const cy = SAFE_TOP + GAME_H * 0.3;
    // 看板
    const sign = this.add.graphics().setDepth(20);
    drawPlate(sign, 190, cy - 150, 340, 68, PAL.woodLight, { radius: 10, shadow: 6, outline: 5 });
    txt(this, 360, cy - 116, 'ガチャ屋の', 40, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 7 }).setDepth(21);
    const logo = title(this, 360, cy, '借金返済', 112, CSS.gold).setDepth(21);
    this.tweens.add({ targets: logo, angle: { from: -2, to: 2 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    txt(this, 360, cy + 96, '（仮）', 30, { color: CSS.sub, stroke: CSS.ink, strokeThickness: 5 }).setDepth(21);
    // TODO(未決): 正式タイトル

    // 下のほうの暗がりから大きな目がのぞく
    const dark = this.add.graphics();
    dark.fillStyle(0x0a050c, 0.8);
    dark.fillEllipse(360, BOTTOM + 60, 820, 300);
    addPeekingEyes(this, 360, BOTTOM - 40, 3).setScale(2.2);

    const tap = txt(this, 360, GAME_H * 0.68, 'タップしてはじめる', 36, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 7 });
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    this.input.once('pointerdown', () => {
      sfx.unlock();
      sfx.play('pop');
      tap.destroy();
      this.showMenu();
    });
  }

  private showMenu() {
    const saved = hasSave() ? loadSave() : null;
    const y = GAME_H * 0.66;
    if (saved) {
      new Button(this, 360, y, {
        w: 460,
        h: 116,
        color: PAL.moss,
        label: 'つづきから',
        sub: `第${saved.week}週 ${saved.day}日目`,
        onPress: () => {
          setState(saved);
          saved.pendingMorning = true;
          this.scene.start('Shop');
        },
      });
      new Button(this, 360, y + 150, {
        w: 460,
        h: 96,
        color: PAL.plum,
        label: 'はじめから',
        size: 30,
        onPress: () => this.startNew(),
      });
    } else {
      new Button(this, 360, y, { w: 460, h: 116, color: PAL.vermilion, label: 'はじめる', size: 40, onPress: () => this.startNew() });
    }
    txt(this, 360, BOTTOM - 150, '音が出ます 🔊', 22, { color: CSS.sub, bold: false });
  }

  private startNew() {
    clearSave();
    setState(newGame());
    saveNow();
    this.scene.start('Shop');
  }
}
