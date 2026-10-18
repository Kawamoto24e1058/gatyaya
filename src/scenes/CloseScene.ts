// 閉店：シャッターが下りる → レジ締め（その日の売上を集計）→ 翌日 or 返済日
import Phaser from 'phaser';
import { BOTTOM, CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { advanceDay, isPayday, S, saveNow } from '../game/state';
import { Button, countUp, stamp, title, txt } from '../ui/widgets';

export class CloseScene extends Phaser.Scene {
  constructor() {
    super('Close');
  }

  create() {
    this.add.image(0, 0, 'bg_plum').setOrigin(0);

    // シャッターが上から下りてくる
    const shutter = this.add.tileSprite(GAME_W / 2, 0, GAME_W, GAME_H, 'shutter').setOrigin(0.5, 1).setDepth(10);
    const bar = this.add.graphics().setDepth(11);
    sfx.play('shutter');
    this.tweens.add({
      targets: shutter,
      y: GAME_H,
      duration: 850,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        bar.clear();
        bar.fillStyle(PAL.ink, 1);
        bar.fillRect(0, shutter.y - 14, GAME_W, 14);
        bar.fillStyle(0x6e6878, 1);
        bar.fillRect(0, shutter.y - 10, GAME_W, 6);
      },
      onComplete: () => {
        this.cameras.main.shake(120, 0.006);
        this.showReceipt();
      },
    });
  }

  private showReceipt() {
    const s = S();
    const d = S().today;
    title(this, 360, Math.max(110, GAME_H * 0.09), `${s.day}日目 閉店`, 48).setDepth(20);
    // 張り紙「本日閉店」
    const notice = this.add.graphics().setDepth(12);
    notice.fillStyle(PAL.paper, 1);
    notice.fillRect(470, GAME_H - 420, 200, 120);
    notice.lineStyle(4, PAL.ink, 1);
    notice.strokeRect(470, GAME_H - 420, 200, 120);
    txt(this, 570, GAME_H - 360, '本日\n閉店', 34, { color: CSS.bad }).setDepth(13).setAngle(3);

    // レシート
    const W = 520;
    const H = 760;
    const paper = this.add.container(360, -H).setDepth(30);
    const g = this.add.graphics();
    g.fillStyle(PAL.ink, 1);
    g.fillRect(-W / 2 + 8, 10, W, H);
    g.fillStyle(PAL.ink, 1);
    g.fillRect(-W / 2 - 4, -4, W + 8, H + 8);
    g.fillStyle(0xfffdf4, 1);
    g.fillRect(-W / 2, 0, W, H);
    // ギザギザの下端
    for (let x = -W / 2; x < W / 2; x += 20) {
      g.fillStyle(PAL.ink, 1);
      g.fillTriangle(x - 2, H + 2, x + 22, H + 2, x + 10, H + 18);
      g.fillStyle(0xfffdf4, 1);
      g.fillTriangle(x, H, x + 20, H, x + 10, H + 12);
    }
    paper.add(g);
    paper.add(txt(this, 0, 50, '＊ 駄菓子とガチャ ＊', 30, { color: CSS.ink }));
    paper.add(txt(this, 0, 92, `第${s.week}週 ${s.day}日目`, 22, { color: CSS.inkSoft, bold: false }));

    const net = s.coins - d.coinsAtStart;
    const rows: [string, number, string][] = [
      ['ガチャ', -d.gachaSpent, `${d.pulls}回`],
      ['売上', d.sales, ''],
      ['バイト代', d.wages, ''],
    ];
    const lineY = (i: number) => 170 + i * 80;
    const valueTexts: Phaser.GameObjects.Text[] = [];
    rows.forEach(([label, , note], i) => {
      paper.add(txt(this, -W / 2 + 36, lineY(i), label, 28, { originX: 0, color: CSS.ink }));
      if (note) paper.add(txt(this, -W / 2 + 190, lineY(i), note, 22, { originX: 0, color: CSS.inkSoft, bold: false }));
      const vt = txt(this, W / 2 - 36, lineY(i), '', 30, { originX: 1, color: CSS.ink });
      valueTexts.push(vt);
      paper.add(vt);
    });
    const dash = this.add.graphics();
    dash.lineStyle(3, PAL.ink, 0.5);
    for (let x = -W / 2 + 30; x < W / 2 - 30; x += 18) dash.lineBetween(x, lineY(3) - 20, x + 10, lineY(3) - 20);
    paper.add(dash);
    paper.add(txt(this, -W / 2 + 36, lineY(3) + 20, '本日の収支', 30, { originX: 0, color: CSS.ink }));
    const netT = txt(this, W / 2 - 36, lineY(3) + 20, '', 42, { originX: 1, color: net >= 0 ? CSS.good : CSS.bad });
    paper.add(netT);
    paper.add(txt(this, -W / 2 + 36, lineY(4) + 30, '所持コイン', 26, { originX: 0, color: CSS.inkSoft }));
    const coinT = txt(this, W / 2 - 36, lineY(4) + 30, '', 34, { originX: 1, color: '#c08a1a' });
    paper.add(coinT);
    paper.add(txt(this, -W / 2 + 36, lineY(5) + 30, `開封 ${d.opened} ・ 朝に化けた ${d.transforms}`, 22, { originX: 0, color: CSS.inkSoft, bold: false }));

    // 印字アニメーション
    const paperY = Math.max(GAME_H * 0.14, 150);
    sfx.play('whoosh');
    this.tweens.add({ targets: paper, y: paperY, duration: 420, ease: 'Cubic.easeOut' });
    const sign = (v: number) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `-${fmt(-v)}` : '0');
    let t = 500;
    rows.forEach(([, v], i) => {
      this.time.delayedCall(t, () => {
        sfx.play('tick', { rate: 1 + i * 0.1 });
        countUp(this, 0, v, 300, (x) => valueTexts[i].setText(sign(x)));
      });
      t += 340;
    });
    this.time.delayedCall(t, () => {
      countUp(this, 0, net, 500, (x) => netT.setText(sign(x)));
      coinT.setText(fmt(s.coins));
    });
    t += 600;
    this.time.delayedCall(t, () => {
      sfx.play('reji');
      sfx.play('stamp', { vol: 0.8 });
      stamp(this, 360 + 140, paperY + lineY(5) + 110, '済', 80, CSS.bad, { hold: Infinity, angle: -15, depth: 40 });
      this.cameras.main.shake(80, 0.004);
      this.showNext();
    });
  }

  private showNext() {
    const s = S();
    const payday = isPayday(s);
    new Button(this, 360, BOTTOM - 80, {
      w: 440,
      h: 112,
      color: payday ? PAL.blood : PAL.moss,
      label: payday ? '返済日へ…' : '次の日へ',
      onPress: () => {
        if (payday) {
          this.scene.start('Payday');
        } else {
          advanceDay(s);
          saveNow();
          this.scene.stop();
          this.scene.wake('Shop');
        }
      },
    }).setDepth(50);
  }
}
