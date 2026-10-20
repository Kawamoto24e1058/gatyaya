// バイト「おみくじ番」：引くほど稼ぎが増えるが、凶が出るとその回の稼ぎは没収。やめ時を決める運試し。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { Button, drawPlate, stamp, txt } from '../ui/widgets';
import { jackpotFx } from '../ui/Jackpot';
import { makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

type Fortune = { label: string; weight: number; color: string; apply: (pot: number) => number };
// TODO(balance)
const FORTUNES: Fortune[] = [
  // めったに出ない大当たり
  { label: '大大吉', weight: 0.02, color: CSS.gold, apply: (p) => p * 5 },
  { label: '大吉', weight: 0.14, color: CSS.gold, apply: (p) => p * 2 },
  { label: '吉', weight: 0.34, color: CSS.good, apply: (p) => p + 10 },
  { label: '小吉', weight: 0.28, color: CSS.cream, apply: (p) => p + 5 },
  { label: '凶', weight: 0.22, color: CSS.bad, apply: () => 0 },
];
const ROUNDS = 3;
const START_POT = 10;
const BONUS_DAIKICHI = 3;
const BOX = { x: 360, y: 560 + OY };

export class OmikujiGame implements MiniGame {
  readonly id = 'omikuji';
  readonly name = 'おみくじ番';
  readonly durationSec = 45;

  private scene!: Phaser.Scene;
  private round = 1;
  private pot = START_POT;
  private banked = 0;
  private daikichi = 0;
  private draws = 0;
  private busy = false;
  private over = false;
  private overAt = 0;
  private box!: Phaser.GameObjects.Container;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private potText!: Phaser.GameObjects.Text;
  private bankText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private drawBtn!: Button;
  private stopBtn!: Button;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    this.box = this.makeBox();
    this.roundText = txt(scene, 360, 300 + OY, '', 30, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 });
    const g = scene.add.graphics();
    drawPlate(g, 160, 790 + OY, 400, 110, PAL.paper, { radius: 14, shadow: 6, outline: 5, shine: false });
    txt(scene, 360, 818 + OY, 'この回の稼ぎ', 22, { color: CSS.inkSoft });
    this.potText = txt(scene, 360, 860 + OY, '', 44, { color: CSS.bad });
    this.bankText = txt(scene, 360, 935 + OY, '', 26, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    this.drawBtn = new Button(scene, 200, 1050 + OY, { w: 280, h: 110, color: PAL.moss, label: '引く', sub: '吉なら増える', onPress: () => this.draw() });
    this.stopBtn = new Button(scene, 520, 1050 + OY, { w: 280, h: 110, color: PAL.mustard, label: 'やめる', sub: '稼ぎを受け取る', onPress: () => this.bank() });
    txt(scene, 360, 1150 + OY, '大大吉 ×5 ／ 大吉 ×2 ／ 吉 +10 ／ 小吉 +5 ／ 凶 没収', 22, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    this.refresh();
  }

  private makeBox() {
    const s = this.scene;
    const c = s.add.container(BOX.x, BOX.y);
    const g = s.add.graphics();
    // 六角のおみくじ筒
    const pts = (r: number, ox = 0, oy = 0) => [0, 1, 2, 3, 4, 5].map((i) => new Phaser.Math.Vector2(ox + Math.cos((i * Math.PI) / 3 + Math.PI / 6) * r * 0.62, oy + Math.sin((i * Math.PI) / 3 + Math.PI / 6) * r));
    g.fillStyle(PAL.ink, 1);
    g.fillPoints(pts(170, 5, 6), true);
    g.fillStyle(PAL.vermilion, 1);
    g.fillPoints(pts(165), true);
    g.fillStyle(PAL.paper, 1);
    g.fillRoundedRect(-44, -110, 88, 220, 8);
    c.add(g);
    c.add(txt(s, 0, -46, 'お', 50, { color: CSS.ink }));
    c.add(txt(s, 0, 4, 'み', 50, { color: CSS.ink }));
    c.add(txt(s, 0, 54, 'く', 50, { color: CSS.ink }));
    c.add(txt(s, 0, 100, 'じ', 40, { color: CSS.ink }));
    return c;
  }

  private refresh() {
    this.roundText.setText(this.over ? 'おしまい' : `${this.round} / ${ROUNDS} 回目`);
    this.potText.setText(`${this.pot}`);
    this.bankText.setText(`受け取り済み ${this.banked}`);
    const can = !this.busy && !this.over;
    this.drawBtn.setEnabled(can);
    this.stopBtn.setEnabled(can && this.draws > 0);
  }

  private draw() {
    if (this.busy || this.over) return;
    this.busy = true;
    this.refresh();
    sfx.play('rumble', { rate: 1.6, vol: 0.5 });
    this.scene.tweens.add({
      targets: this.box,
      angle: { from: -14, to: 14 },
      duration: 70,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.box.angle = 0;
        this.reveal(this.roll());
      },
    });
  }

  private roll(): Fortune {
    let r = Math.random();
    for (const f of FORTUNES) {
      if (r < f.weight) return f;
      r -= f.weight;
    }
    return FORTUNES[FORTUNES.length - 1];
  }

  private reveal(f: Fortune) {
    const s = this.scene;
    this.draws += 1;
    // 棒が飛び出す
    const stick = s.add.container(BOX.x, BOX.y - 100).setDepth(500);
    const g = s.add.graphics();
    drawPlate(g, -30, -150, 60, 170, PAL.paper, { radius: 6, shadow: 4, outline: 4, shine: false });
    stick.add(g);
    stick.add(txt(s, 0, -66, f.label.split('').join('\n'), 34, { color: f.color === CSS.cream ? CSS.ink : f.color, stroke: f.color === CSS.gold ? CSS.ink : undefined, strokeThickness: f.color === CSS.gold ? 4 : 0 }));
    stick.setScale(0.4);
    s.tweens.add({ targets: stick, x: BOX.x + 200, y: BOX.y + 40, angle: 12, scale: 1, duration: 240, ease: 'Back.easeOut' });
    s.tweens.add({ targets: stick, alpha: 0, delay: 900, duration: 250, onComplete: () => stick.destroy() });

    const before = this.pot;
    this.pot = f.apply(this.pot);
    if (f.label === '凶') {
      sfx.play('buzz');
      sfx.play('fail', { vol: 0.6 });
      vibrate(40);
      s.cameras.main.shake(260, 0.01);
      stamp(s, 360, BOX.y + 40, 'バチが当たった…', 46, CSS.bad, { hold: 500, depth: 900 });
      popText(s, 360, 760 + OY, `-${before}`, CSS.bad, 40);
      s.time.delayedCall(900, () => this.endRound());
    } else {
      if (f.label === '大大吉') {
        this.daikichi += 1;
        jackpotFx(s, { heading: '大大吉！ ×5', amount: this.pot, sub: 'この回の稼ぎが 5 倍に！', big: this.pot >= 150 });
      } else if (f.label === '大吉') {
        this.daikichi += 1;
        sfx.play('fanfare', { vol: 0.8 });
        this.sparks.explode(26, BOX.x + 200, BOX.y);
        stamp(s, 360, BOX.y + 40, '大吉！ ×2', 56, CSS.gold, { hold: 400, depth: 900 });
      } else {
        sfx.play('sparkle', { rate: f.label === '吉' ? 1.1 : 0.9, vol: 0.7 });
      }
      popText(s, 360, 760 + OY, `+${this.pot - before}`, CSS.gold, 40);
      vibrate(10);
      s.time.delayedCall(450, () => {
        this.busy = false;
        this.refresh();
      });
    }
    this.refresh();
  }

  private bank() {
    if (this.busy || this.over || this.draws === 0) return;
    this.banked += this.pot;
    sfx.play('coin');
    popText(this.scene, 360, 935 + OY, `+${this.pot} 受け取り`, CSS.gold, 36);
    this.endRound();
  }

  private endRound() {
    this.pot = START_POT;
    this.draws = 0;
    this.busy = false;
    if (this.round >= ROUNDS) {
      this.over = true;
      this.overAt = this.scene.time.now;
    } else {
      this.round += 1;
      stamp(this.scene, 360, 300 + OY, `${this.round} 回目`, 44, CSS.cream, { hold: 300, depth: 900 });
    }
    this.refresh();
  }

  isDone(): boolean {
    return this.over && this.scene.time.now - this.overAt > 700;
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    // 時間切れなら、引いた分の稼ぎは受け取ったことにする
    if (!this.over && this.draws > 0) this.banked += this.pot;
    this.destroy();
    const bonus: Reward | undefined = this.daikichi >= BONUS_DAIKICHI ? { kind: 'nightBoost' } : undefined;
    return { coins: this.banked, bonus, summary: `大吉 ${this.daikichi} 回` };
  }

  destroy(): void {
    this.drawBtn?.destroy();
    this.stopBtn?.destroy();
  }
}

export const OMIKUJI_BONUS_DAIKICHI = BONUS_DAIKICHI;
