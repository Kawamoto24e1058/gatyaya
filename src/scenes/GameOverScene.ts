import Phaser from 'phaser';
import { CSS, GAME_W } from '../config';
import { fmt } from '../core/util';
import { RARITY_INFO } from '../data/rarity';
import { clearSave, newGame, S, saveNow, setState } from '../game/state';
import { Button, panel, txt } from '../ui/widgets';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    const s = S();
    // 再開時にゲームオーバー直前から始まらないよう、ここでセーブを消す
    clearSave();
    this.add.rectangle(360, 640, GAME_W, 1280, 0x0d0818, 1);
    txt(this, 360, 200, 'ゲームオーバー', 64, { color: CSS.bad });
    txt(this, 360, 280, '店は差し押さえられた…', 30, { color: CSS.sub, bold: false });

    panel(this, 360, 560, 580, 420, 0x2f2450);
    const rows: [string, string][] = [
      ['到達', `第${s.week}週 ${s.day}日目`],
      ['ガチャ回数', `${s.totals.pulls}回`],
      ['合体回数', `${s.totals.merges}回`],
      ['総売上', fmt(s.totals.sales)],
      ['最高レア', s.totals.bestRarity ?? '-'],
    ];
    rows.forEach(([k, v], i) => {
      const y = 410 + i * 70;
      txt(this, 120, y, k, 28, { originX: 0, color: CSS.cream, bold: false });
      const color = k === '最高レア' && s.totals.bestRarity ? RARITY_INFO[s.totals.bestRarity].css : CSS.white;
      txt(this, 600, y, v, 32, { originX: 1, color });
    });

    new Button(this, 360, 1000, {
      w: 460,
      h: 116,
      color: 0xff5a7a,
      label: 'もう一度',
      onPress: () => {
        setState(newGame());
        saveNow();
        this.scene.start('Shop');
      },
    });
  }
}
