// 閉店：レジ締め演出（その日の売上を集計）→ 翌日 or 返済日
import Phaser from 'phaser';
import { CSS, GAME_W } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { advanceDay, isPayday, S, saveNow } from '../game/state';
import { Button, countUp, txt } from '../ui/widgets';

export class CloseScene extends Phaser.Scene {
  constructor() {
    super('Close');
  }

  create() {
    const s = S();
    const d = s.today;
    this.add.rectangle(360, 640, GAME_W, 1280, 0x120c22, 0.96);
    txt(this, 360, 110, `${s.day}日目 閉店`, 44, { color: CSS.cream });

    // レシート
    const paper = this.add.container(360, -700);
    const W = 520;
    const H = 760;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRect(-W / 2 + 8, 8, W, H);
    g.fillStyle(0xfffdf6, 1);
    g.fillRect(-W / 2, 0, W, H);
    // ギザギザの下端
    g.fillStyle(0xfffdf6, 1);
    for (let x = -W / 2; x < W / 2; x += 20) g.fillTriangle(x, H, x + 20, H, x + 10, H + 12);
    paper.add(g);
    paper.add(txt(this, 0, 50, '＊ レシート ＊', 30, { color: CSS.ink }));
    paper.add(txt(this, 0, 92, `第${s.week}週 ${s.day}日目`, 22, { color: '#6b5f8a', bold: false }));

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
      if (note) paper.add(txt(this, -W / 2 + 190, lineY(i), note, 22, { originX: 0, color: '#8a80a6', bold: false }));
      const vt = txt(this, W / 2 - 36, lineY(i), '', 30, { originX: 1, color: CSS.ink });
      valueTexts.push(vt);
      paper.add(vt);
    });
    const dash = this.add.graphics();
    dash.lineStyle(3, 0x2a1f45, 0.4);
    for (let x = -W / 2 + 30; x < W / 2 - 30; x += 18) dash.lineBetween(x, lineY(3) - 20, x + 10, lineY(3) - 20);
    paper.add(dash);
    paper.add(txt(this, -W / 2 + 36, lineY(3) + 20, '本日の収支', 30, { originX: 0, color: CSS.ink }));
    const netT = txt(this, W / 2 - 36, lineY(3) + 20, '', 40, { originX: 1, color: net >= 0 ? '#1f9e5a' : '#d63a3a' });
    paper.add(netT);
    paper.add(txt(this, -W / 2 + 36, lineY(4) + 30, '所持コイン', 26, { originX: 0, color: '#6b5f8a' }));
    const coinT = txt(this, W / 2 - 36, lineY(4) + 30, '', 34, { originX: 1, color: '#d18a00' });
    paper.add(coinT);
    paper.add(txt(this, -W / 2 + 36, lineY(5) + 30, `開封 ${d.opened} ・ 合体 ${d.merges}`, 22, { originX: 0, color: '#8a80a6', bold: false }));
    const stamp = txt(this, 120, lineY(5) + 120, '済', 64, { color: '#d63a3a' }).setAlpha(0).setAngle(-15);
    paper.add(stamp);

    // 印字アニメーション
    sfx.play('whoosh');
    this.tweens.add({ targets: paper, y: 170, duration: 420, ease: 'Cubic.easeOut' });
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
      stamp.setAlpha(1).setScale(2);
      this.tweens.add({ targets: stamp, scale: 1, duration: 140, ease: 'Back.easeOut' });
      this.cameras.main.shake(80, 0.004);
      this.showNext();
    });
  }

  private showNext() {
    const s = S();
    const payday = isPayday(s);
    new Button(this, 360, 1150, {
      w: 440,
      h: 112,
      color: payday ? 0xff5a5a : 0x4fd18b,
      label: payday ? '返済日へ' : '次の日へ',
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
    });
  }
}
