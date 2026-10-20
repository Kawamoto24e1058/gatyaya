// バイト「棚卸し」：伏せた景品札を 2 枚ずつめくって、同じ絵をそろえる（神経衰弱）。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { comboLabel, makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

const COLS = 4;
const ROWS = 4;
const CW = 136;
const CH = 150;
const GAP = 16;
const X0 = 360 - (COLS * CW + (COLS - 1) * GAP) / 2 + CW / 2;
const Y0 = 400 + OY;
const FACES: { g: string; c: number }[] = [
  { g: '猫', c: PAL.paper },
  { g: '狐', c: PAL.mustard },
  { g: '狸', c: 0xb68a54 },
  { g: '鬼', c: PAL.vermilion },
  { g: '傘', c: PAL.lavender },
  { g: '灯', c: 0xf2c94c },
  { g: '鈴', c: PAL.teal },
  { g: '蛙', c: PAL.moss },
];
// TODO(balance)
const PAIR_PAY = 3;
const CLEAR_PAY = 12;
const BONUS_BOARDS = 2;

type Card = { face: number; obj: Phaser.GameObjects.Container; front: Phaser.GameObjects.Container; back: Phaser.GameObjects.Graphics; open: boolean; done: boolean };

export class MemoryGame implements MiniGame {
  readonly id = 'memory';
  readonly name = '棚卸し';
  readonly durationSec = 45;

  private scene!: Phaser.Scene;
  private cards: Card[] = [];
  private picked: Card[] = [];
  private lock = false;
  private boards = 0;
  private pairs = 0;
  private streak = 0;
  private coins = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private infoText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    this.comboText = comboLabel(scene, Y0 - 110);
    this.infoText = txt(scene, 360, Y0 + ROWS * (CH + GAP) + 10, '', 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    txt(scene, 360, Y0 + ROWS * (CH + GAP) + 60, '同じ絵の札を 2 枚そろえよう。連続でそろえると割増', 22, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    this.deal();
  }

  private deal() {
    for (const c of this.cards) c.obj.destroy();
    const faces = Phaser.Utils.Array.Shuffle([...Array(8).keys(), ...Array(8).keys()]);
    this.cards = faces.map((face, i) => {
      const x = X0 + (i % COLS) * (CW + GAP);
      const y = Y0 + Math.floor(i / COLS) * (CH + GAP);
      const obj = this.scene.add.container(x, y);
      const back = this.scene.add.graphics();
      drawPlate(back, -CW / 2, -CH / 2, CW, CH, PAL.woodDark, { radius: 12, shadow: 5, outline: 4, shine: false });
      back.fillStyle(PAL.wood, 1);
      back.fillRoundedRect(-CW / 2 + 12, -CH / 2 + 12, CW - 24, CH - 24, 8);
      back.lineStyle(3, PAL.mustard, 0.6);
      back.strokeCircle(0, 0, 26);
      const front = this.scene.add.container(0, 0);
      const fg = this.scene.add.graphics();
      drawPlate(fg, -CW / 2, -CH / 2, CW, CH, PAL.paper, { radius: 12, shadow: 5, outline: 4, shine: false });
      fg.fillStyle(PAL.ink, 1);
      fg.fillCircle(3, 4, 44);
      fg.fillStyle(FACES[face].c, 1);
      fg.fillCircle(0, 0, 41);
      front.add(fg);
      front.add(txt(this.scene, 0, 2, FACES[face].g, 48, { color: CSS.ink }));
      front.setVisible(false);
      obj.add([back, front]);
      obj.setSize(CW, CH).setInteractive({ useHandCursor: true });
      const card: Card = { face, obj, front, back, open: false, done: false };
      obj.on('pointerdown', () => this.flip(card));
      obj.setScale(0);
      this.scene.tweens.add({ targets: obj, scale: 1, duration: 200, delay: i * 25, ease: 'Back.easeOut' });
      return card;
    });
    this.refresh();
  }

  private show(c: Card, open: boolean) {
    c.open = open;
    this.scene.tweens.add({
      targets: c.obj,
      scaleX: 0,
      duration: 80,
      onComplete: () => {
        c.front.setVisible(open);
        c.back.setVisible(!open);
        this.scene.tweens.add({ targets: c.obj, scaleX: 1, duration: 80 });
      },
    });
  }

  private flip(c: Card) {
    if (this.lock || c.open || c.done) return;
    sfx.play('flip', { rate: 1.2 });
    this.show(c, true);
    this.picked.push(c);
    if (this.picked.length < 2) return;
    const [a, b] = this.picked;
    this.picked = [];
    this.lock = true;
    if (a.face === b.face) {
      this.scene.time.delayedCall(220, () => {
        a.done = b.done = true;
        this.pairs += 1;
        this.streak += 1;
        const gain = PAIR_PAY + Math.min(this.streak - 1, 4);
        this.coins += gain;
        sfx.play('sparkle', { rate: 1 + Math.min(this.streak, 6) * 0.06 });
        vibrate(10);
        for (const c of [a, b]) {
          this.sparks.explode(10, c.obj.x, c.obj.y);
          this.scene.tweens.add({ targets: c.obj, alpha: 0.35, duration: 200 });
        }
        popText(this.scene, (a.obj.x + b.obj.x) / 2, (a.obj.y + b.obj.y) / 2 - 40, `+${gain}`, CSS.gold);
        this.comboText.setText(this.streak >= 2 ? `${this.streak} 連続！` : '');
        this.lock = false;
        if (this.cards.every((c) => c.done)) this.clearBoard();
        this.refresh();
      });
    } else {
      this.streak = 0;
      this.comboText.setText('');
      this.scene.time.delayedCall(650, () => {
        sfx.play('tap', { rate: 0.8 });
        this.show(a, false);
        this.show(b, false);
        this.lock = false;
      });
    }
  }

  private clearBoard() {
    this.boards += 1;
    this.coins += CLEAR_PAY;
    sfx.play('fanfare', { vol: 0.7 });
    stamp(this.scene, 360, Y0 + 230, `棚卸し完了！ +${CLEAR_PAY}`, 46, CSS.gold, { hold: 500, depth: 900 });
    this.lock = true;
    this.scene.time.delayedCall(900, () => {
      this.lock = false;
      this.deal();
    });
  }

  private refresh() {
    this.infoText.setText(`そろえた ${this.pairs} 組 ／ 完了 ${this.boards} 棚`);
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.lock = true;
    const bonus: Reward | undefined = this.boards >= BONUS_BOARDS ? { kind: 'jarCapacityWeek', amount: 2 } : undefined;
    // 1 組もそろわなくても、出勤した分の手間賃は出す
    return { coins: Math.max(this.coins, 10), bonus, summary: `そろえた ${this.pairs} 組 ／ 完了 ${this.boards} 棚` };
  }

  destroy(): void {
    for (const c of this.cards) c.obj.disableInteractive();
  }
}

export const MEMORY_BONUS_BOARDS = BONUS_BOARDS;
