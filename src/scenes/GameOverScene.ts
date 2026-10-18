import Phaser from 'phaser';
import { BOTTOM, CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { RARITY_INFO } from '../data/rarity';
import { clearSave, newGame, S, saveNow, setState } from '../game/state';
import { Button, drawPlate, title, txt } from '../ui/widgets';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  private cleared = false;

  init(data: { cleared?: boolean }) {
    this.cleared = !!data?.cleared;
  }

  create() {
    const s = S();
    // 再開時にゲームオーバー直前から始まらないよう、ここでセーブを消す
    clearSave();
    // 下りたままのシャッター
    this.add.tileSprite(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 'shutter');
    const shade = this.add.graphics();
    shade.fillStyle(0x0d0710, 0.45);
    shade.fillRect(0, 0, GAME_W, GAME_H);

    // 差押のお札
    const ofuda = this.add.container(360, GAME_H * 0.2).setAngle(-4);
    const og = this.add.graphics();
    drawPlate(og, -120, -150, 240, 300, PAL.paper, { radius: 4, shadow: 8, outline: 5, shine: false });
    og.lineStyle(6, PAL.blood, 1);
    og.strokeRect(-100, -130, 200, 260);
    ofuda.add(og);
    ofuda.add(txt(this, 0, -10, this.cleared ? '完\n済' : '差\n押', 96, { color: this.cleared ? CSS.good : CSS.bad }));
    ofuda.setScale(2).setAlpha(0);
    this.tweens.add({ targets: ofuda, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut', onComplete: () => sfx.play('stamp') });

    if (this.cleared) {
      const conf = this.add.particles(0, 0, 'confetti', {
        x: { min: 0, max: GAME_W },
        y: -20,
        speedY: { min: 120, max: 260 },
        speedX: { min: -40, max: 40 },
        rotate: { start: 0, end: 540 },
        lifespan: 6000,
        frequency: 60,
        tint: [PAL.vermilion, PAL.mustard, PAL.moss, PAL.teal, PAL.lavender, PAL.paper],
      });
      conf.setDepth(5);
      this.time.delayedCall(300, () => sfx.play('fanfare'));
    }
    title(this, 360, GAME_H * 0.38, this.cleared ? '借金完済！' : 'ゲームオーバー', 56, this.cleared ? CSS.gold : '#f2a090');
    txt(this, 360, GAME_H * 0.38 + 60, this.cleared ? 'この町の借金をすべて返した！' : '店は差し押さえられた…', 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    // TODO(Phase 3): 完済したら次の町へ（ノルマ・相場・イベントを新しく抽選）

    const py = GAME_H * 0.6;
    const pg = this.add.graphics();
    drawPlate(pg, 80, py - 170, 560, 360, PAL.paper, { radius: 12, shadow: 8, outline: 5, shine: false });
    const rows: [string, string][] = [
      ['到達', `第${this.cleared ? s.week - 1 : s.week}週 ${s.day}日目`],
      ['ガチャ回数', `${s.totals.pulls}回`],
      ['化けた回数', `${s.totals.transforms}回`],
      ['総売上', fmt(s.totals.sales)],
      ['最高レア', s.totals.bestRarity ?? '-'],
    ];
    rows.forEach(([k, v], i) => {
      const y = py - 120 + i * 62;
      txt(this, 120, y, k, 28, { originX: 0, color: CSS.inkSoft });
      const color = k === '最高レア' && s.totals.bestRarity ? RARITY_INFO[s.totals.bestRarity].css : CSS.ink;
      txt(this, 600, y, v, 32, { originX: 1, color, stroke: k === '最高レア' ? CSS.ink : undefined, strokeThickness: k === '最高レア' ? 5 : 0 });
    });

    new Button(this, 360, BOTTOM - 90, {
      w: 460,
      h: 116,
      color: PAL.vermilion,
      label: this.cleared ? '新しい町で始める' : 'もう一度',
      onPress: () => {
        setState(newGame());
        saveNow();
        this.scene.start('Shop');
      },
    });
  }
}
