// 返済日：ノルマ未達ならゲームオーバー
import Phaser from 'phaser';
import { CSS, GAME_W } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { advanceDay, payDebt, S, saveNow } from '../game/state';
import { Button, countUp, panel, txt } from '../ui/widgets';

export class PaydayScene extends Phaser.Scene {
  constructor() {
    super('Payday');
  }

  create() {
    const s = S();
    this.add.rectangle(360, 640, GAME_W, 1280, 0x120c22, 1);
    txt(this, 360, 150, '返済日', 72, { color: CSS.bad, stroke: '#000000', strokeThickness: 8 });
    txt(this, 360, 230, `第${s.week}週`, 30, { color: CSS.sub });

    panel(this, 360, 520, 600, 420, 0x2f2450);
    txt(this, 120, 380, '今週の返済', 30, { originX: 0, color: CSS.cream });
    txt(this, 600, 380, fmt(s.quota), 44, { originX: 1, color: CSS.bad });
    txt(this, 120, 460, '所持コイン', 30, { originX: 0, color: CSS.cream });
    const coinT = txt(this, 600, 460, fmt(s.coins), 44, { originX: 1, color: CSS.gold });

    const quota = s.quota;
    const coinsBefore = s.coins;
    const ok = coinsBefore >= quota;

    const bar = this.add.graphics();
    const drawBar = (v: number) => {
      bar.clear();
      bar.fillStyle(0x000000, 0.4);
      bar.fillRoundedRect(110, 540, 500, 30, 15);
      bar.fillStyle(v >= 1 ? 0x4fd18b : 0xffc531, 1);
      bar.fillRoundedRect(110, 540, Math.max(30, 500 * Math.min(1, v)), 30, 15);
    };
    drawBar(0);
    const o = { v: 0 };
    this.tweens.add({
      targets: o,
      v: coinsBefore / quota,
      duration: 1200,
      delay: 400,
      ease: 'Cubic.easeInOut',
      onUpdate: () => drawBar(o.v),
    });
    for (let i = 0; i < 8; i++) this.time.delayedCall(400 + i * 140, () => sfx.play('tick', { rate: 0.9 + i * 0.08 }));

    this.time.delayedCall(1800, () => {
      if (ok) {
        payDebt(s);
        countUp(this, coinsBefore, s.coins, 600, (v) => coinT.setText(fmt(v)));
        sfx.play('reji');
        sfx.play('fanfare', { delay: 0.4 });
        const t = txt(this, 360, 640, '返済完了！', 64, { color: CSS.good, stroke: '#000000', strokeThickness: 8 }).setScale(2);
        this.tweens.add({ targets: t, scale: 1, duration: 250, ease: 'Back.easeOut' });
        txt(this, 360, 800, `来週のノルマ ${fmt(s.quota)}`, 34, { color: CSS.cream });
        // TODO(Phase 2): ここでレリックショップ（3 つから 1 つ選ぶ）へ
        txt(this, 360, 860, 'ショップ（レリック）は Phase 2 で追加予定', 20, { color: CSS.sub, bold: false });
        new Button(this, 360, 1100, {
          w: 440,
          h: 112,
          color: 0x4fd18b,
          label: '次の週へ',
          onPress: () => {
            advanceDay(s);
            saveNow();
            this.scene.stop();
            this.scene.wake('Shop');
          },
        });
      } else {
        sfx.play('fail');
        this.cameras.main.shake(300, 0.01);
        const t = txt(this, 360, 820, '返済できなかった…', 56, { color: CSS.bad, stroke: '#000000', strokeThickness: 8 });
        t.setAlpha(0);
        this.tweens.add({ targets: t, alpha: 1, duration: 400 });
        txt(this, 360, 910, `あと ${fmt(quota - coinsBefore)} 足りなかった`, 30, { color: CSS.cream });
        new Button(this, 360, 1100, {
          w: 440,
          h: 112,
          color: 0xff5a5a,
          label: '結果を見る',
          onPress: () => {
            this.scene.stop('Shop');
            this.scene.start('GameOver');
          },
        });
      }
    });
  }
}
