// タイトル。最初のタップで AudioContext を resume する（iOS 対策）。
import Phaser from 'phaser';
import { CSS, GAME_W } from '../config';
import { sfx } from '../core/audio';
import { capsuleKey, makeTextures } from '../ui/textures';
import { RARITIES } from '../data/rarity';
import { clearSave, hasSave, loadMuted, loadSave, newGame, saveNow, setState } from '../game/state';
import { Button, txt } from '../ui/widgets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    makeTextures(this);
    sfx.init();
    sfx.setMuted(loadMuted());

    this.add.rectangle(360, 640, GAME_W, 1280, 0x1b1430);
    // 背景に転がるカプセル
    for (let i = 0; i < 14; i++) {
      const img = this.add
        .image(Phaser.Math.Between(40, 680), Phaser.Math.Between(-600, 1280), capsuleKey(RARITIES[i % 5]))
        .setAlpha(0.25)
        .setScale(Phaser.Math.FloatBetween(0.8, 1.6));
      this.tweens.add({
        targets: img,
        y: img.y + 1400,
        rotation: Phaser.Math.FloatBetween(-6, 6),
        duration: Phaser.Math.Between(9000, 16000),
        repeat: -1,
        onRepeat: () => (img.y = -100),
      });
    }

    txt(this, 360, 330, 'ガチャ屋の', 48, { color: CSS.cream });
    txt(this, 360, 420, '借金返済', 96, { color: CSS.gold, stroke: '#2a1f45', strokeThickness: 12 });
    txt(this, 360, 510, '（仮）', 30, { color: CSS.sub });
    // TODO(未決): 正式タイトル

    const tap = txt(this, 360, 900, 'タップしてはじめる', 36, { color: CSS.white });
    this.tweens.add({ targets: tap, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    this.input.once('pointerdown', () => {
      sfx.unlock();
      sfx.play('pop');
      tap.destroy();
      this.showMenu();
    });
  }

  private showMenu() {
    const saved = hasSave() ? loadSave() : null;
    if (saved) {
      new Button(this, 360, 860, {
        w: 460,
        h: 116,
        color: 0x4fd18b,
        label: 'つづきから',
        sub: `第${saved.week}週 ${saved.day}日目`,
        onPress: () => {
          setState(saved);
          saved.pendingMorning = true;
          this.scene.start('Shop');
        },
      });
      new Button(this, 360, 1010, {
        w: 460,
        h: 96,
        color: 0x8a80a6,
        label: 'はじめから',
        size: 30,
        onPress: () => this.startNew(),
      });
    } else {
      new Button(this, 360, 900, { w: 460, h: 116, color: 0xff5a7a, label: 'はじめる', onPress: () => this.startNew() });
    }
    txt(this, 360, 1200, '音が出ます 🔊', 22, { color: CSS.sub, bold: false });
  }

  private startNew() {
    clearSave();
    setState(newGame());
    saveNow();
    this.scene.start('Shop');
  }
}
