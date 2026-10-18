// 返済日：取り立て屋が現れる。ノルマ未達ならゲームオーバー
import Phaser from 'phaser';
import { BALANCE, BOTTOM, CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { advanceDay, payDebt, S, saveNow } from '../game/state';
import { Collector } from '../ui/Collector';
import { Button, countUp, drawPlate, stamp, title, txt } from '../ui/widgets';

export class PaydayScene extends Phaser.Scene {
  constructor() {
    super('Payday');
  }

  create() {
    const s = S();
    this.add.image(0, 0, 'bg_night').setOrigin(0);
    title(this, 360, Math.max(90, GAME_H * 0.07), `第${s.week}週 返済日`, 52, '#f2a090').setDepth(30);

    // 取り立て屋が暗がりからせり上がる
    const collectorY = GAME_H * 0.38;
    const col = new Collector(this, 360, GAME_H + 400).setDepth(5).setScale(0.9);
    sfx.play('rumble');
    this.tweens.add({ targets: col, y: collectorY, duration: 900, ease: 'Cubic.easeOut' });
    this.time.addEvent({ delay: 2200, loop: true, callback: () => col.blink() });

    const quota = s.quota;
    const coinsBefore = s.coins;
    const ok = coinsBefore >= quota;

    // 吹き出し
    const say = (msg: string, delay: number) => {
      this.time.delayedCall(delay, () => {
        const c = this.add.container(360, collectorY - 330).setDepth(40);
        const t = txt(this, 0, 0, msg, 28, { color: CSS.ink, wrap: 520 });
        const w = t.width + 56;
        const h = t.height + 30;
        const g = this.add.graphics();
        drawPlate(g, -w / 2, -h / 2, w, h, PAL.paper, { radius: 26, shadow: 6, outline: 5, shine: false });
        g.fillStyle(PAL.ink, 1);
        g.fillTriangle(-20, h / 2 + 3, 20, h / 2 + 3, 30, h / 2 + 30);
        g.fillStyle(PAL.paper, 1);
        g.fillTriangle(-12, h / 2 - 2, 12, h / 2 - 2, 22, h / 2 + 18);
        c.add([g, t]);
        c.setScale(0.5).setAlpha(0);
        this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
        this.time.delayedCall(1900, () => this.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() }));
      });
    };
    say(`ヒッヒ…今週の分、\n${fmt(quota)}コイン払ってもらおうか`, 900);

    // 帳簿パネル
    const py = GAME_H * 0.64;
    const pg = this.add.graphics().setDepth(20);
    drawPlate(pg, 70, py - 110, 580, 250, PAL.paper, { radius: 16, shadow: 8, outline: 5, shine: false });
    pg.fillStyle(PAL.blood, 1);
    pg.fillRect(70, py - 110, 580, 40);
    txt(this, 360, py - 90, '借用書', 24, { color: CSS.cream }).setDepth(21);
    txt(this, 110, py - 26, '今週の返済', 28, { originX: 0, color: CSS.ink }).setDepth(21);
    txt(this, 610, py - 26, fmt(quota), 42, { originX: 1, color: CSS.bad }).setDepth(21);
    txt(this, 110, py + 34, '所持コイン', 28, { originX: 0, color: CSS.ink }).setDepth(21);
    const coinT = txt(this, 610, py + 34, fmt(coinsBefore), 42, { originX: 1, color: '#c08a1a' }).setDepth(21);
    const bar = this.add.graphics().setDepth(21);
    const drawBar = (v: number) => {
      bar.clear();
      bar.fillStyle(PAL.ink, 1);
      bar.fillRoundedRect(106, py + 82, 508, 30, 15);
      bar.fillStyle(0x4a3a4e, 1);
      bar.fillRoundedRect(110, py + 86, 500, 22, 11);
      bar.fillStyle(v >= 1 ? PAL.moss : PAL.mustard, 1);
      bar.fillRoundedRect(110, py + 86, Math.max(22, 500 * Math.min(1, v)), 22, 11);
    };
    drawBar(0);
    const o = { v: 0 };
    this.tweens.add({ targets: o, v: coinsBefore / quota, duration: 1200, delay: 1400, ease: 'Cubic.easeInOut', onUpdate: () => drawBar(o.v) });
    for (let i = 0; i < 8; i++) this.time.delayedCall(1400 + i * 140, () => sfx.play('tick', { rate: 0.9 + i * 0.08 }));

    this.time.delayedCall(2900, () => {
      if (ok) {
        payDebt(s);
        const cleared = s.week > BALANCE.weeksPerTown;
        countUp(this, coinsBefore, s.coins, 600, (v) => coinT.setText(fmt(v)));
        col.satisfied();
        say(cleared ? '…ちっ、全部返されちまった。\nこの町じゃもう取り立てられねぇ' : '…確かに。また来週な', 0);
        sfx.play('reji');
        sfx.play('fanfare', { delay: 0.4 });
        stamp(this, 380, py + 96, cleared ? '完済' : '返済完了', cleared ? 96 : 64, CSS.good, { hold: Infinity, angle: -8, depth: 50 });
        this.tweens.add({ targets: col, y: GAME_H + 400, delay: 1600, duration: 900, ease: 'Cubic.easeIn' });
        if (cleared) {
          this.time.delayedCall(700, () => sfx.play('fanfare', { rate: 1.12 }));
          new Button(this, 360, BOTTOM - 80, {
            w: 440,
            h: 112,
            color: PAL.mustard,
            label: '完済の記録を見る',
            onPress: () => {
              this.scene.stop('Shop');
              this.scene.start('GameOver', { cleared: true });
            },
          }).setDepth(60);
          return;
        }
        txt(this, 360, py + 180, `来週のノルマ ${fmt(s.quota)}  （完済まであと${BALANCE.weeksPerTown - s.week + 1}週）`, 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 }).setDepth(30);
        // TODO(Phase 2): ここでレリックショップ（3 つから 1 つ選ぶ）へ
        new Button(this, 360, BOTTOM - 80, {
          w: 440,
          h: 112,
          color: PAL.moss,
          label: '次の週へ',
          onPress: () => {
            advanceDay(s);
            saveNow();
            this.scene.stop();
            this.scene.wake('Shop');
          },
        }).setDepth(60);
      } else {
        col.furious();
        sfx.play('fail');
        sfx.play('rumble', { rate: 0.8 });
        say(`足りねぇなぁ…\nあと ${fmt(quota - coinsBefore)} だ`, 0);
        this.cameras.main.shake(400, 0.01);
        // 迫ってくる
        this.tweens.add({ targets: col, scale: 1.6, y: collectorY + 120, duration: 1400, ease: 'Cubic.easeIn' });
        const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0).setDepth(25);
        this.tweens.add({ targets: dim, fillAlpha: 0.5, duration: 1400 });
        this.time.delayedCall(1000, () => {
          sfx.play('stamp');
          stamp(this, 380, py + 80, '差押', 96, CSS.bad, { hold: Infinity, angle: -12, depth: 50 });
        });
        new Button(this, 360, BOTTOM - 80, {
          w: 440,
          h: 112,
          color: PAL.blood,
          label: '結果を見る',
          onPress: () => {
            this.scene.stop('Shop');
            this.scene.start('GameOver');
          },
        }).setDepth(60);
      }
    });
  }
}
