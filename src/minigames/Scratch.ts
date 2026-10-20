// バイト「くじの検品」：スクラッチくじを指でこすって削る。同じ絵が 3 つそろえば当たり。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { sfx } from '../core/audio';
import { vibrate } from '../core/util';
import { drawPlate, stamp, txt } from '../ui/widgets';
import { makeSparks, OY, popText } from './kit';
import type { MiniGame, Reward } from './types';

type Sym = 'zeni' | 'koban' | 'kozuchi' | 'neko';
const SYMS: Record<Sym, { label: string; face: number; ink: string; prize: number; name: string }> = {
  zeni: { label: '銭', face: 0xb68a54, ink: CSS.ink, prize: 12, name: '銭' },
  koban: { label: '判', face: PAL.mustard, ink: CSS.ink, prize: 30, name: '小判' },
  kozuchi: { label: '槌', face: PAL.vermilion, ink: CSS.cream, prize: 80, name: '打ち出の小槌' },
  neko: { label: '猫', face: 0xffffff, ink: CSS.bad, prize: 20, name: '招き猫' },
};
// 1 枚ごとの当たりの出方。TODO(balance)
const OUTCOMES: [Sym | null, number][] = [
  [null, 0.45],
  ['zeni', 0.3],
  ['koban', 0.15],
  ['kozuchi', 0.07],
  ['neko', 0.03],
];
const CARDS = 4;
const BASE_PAY = 3; // 1 枚削り終えるごとの手間賃
const COLS = 3;
const ROWS = 2;
const PW = 150;
const PH = 130;
const GAP = 16;
const CARD = { x: 360, y: 640 + OY };
const GRID_W = COLS * PW + (COLS - 1) * GAP;
const GRID_H = ROWS * PH + (ROWS - 1) * GAP;
const GX = CARD.x - GRID_W / 2;
const GY = CARD.y - GRID_H / 2 + 30;
const BRUSH = 30;
const SUB = 4; // 1 マスを 4×4 に区切って削れ具合を数える
const REVEAL_AT = 0.55;

type Panel = { sym: Sym; hits: Set<number>; open: boolean; x: number; y: number };

function makeCard(): Sym[] {
  let r = Math.random();
  let win: Sym | null = null;
  for (const [s, p] of OUTCOMES) {
    if (r < p) {
      win = s;
      break;
    }
    r -= p;
  }
  const all = Object.keys(SYMS) as Sym[];
  const out: Sym[] = [];
  if (win) out.push(win, win, win);
  // 残りは「2 つまで」でうめる（惜しいハズレを作る）
  const count = (s: Sym) => out.filter((x) => x === s).length;
  while (out.length < COLS * ROWS) {
    const cand = all.filter((s) => s !== win && count(s) < 2);
    out.push(cand[Math.floor(Math.random() * cand.length)]);
  }
  return Phaser.Utils.Array.Shuffle(out);
}

export class ScratchGame implements MiniGame {
  readonly id = 'scratch';
  readonly name = 'くじの検品';
  readonly durationSec = 40;

  private scene!: Phaser.Scene;
  private card?: Phaser.GameObjects.Container;
  private cover?: Phaser.GameObjects.RenderTexture;
  private panels: Panel[] = [];
  private cardNo = 0;
  private done = 0;
  private wins: Sym[] = [];
  private coins = 0;
  private gotNeko = false;
  private finishedAt = 0;
  private down = false;
  private lastSnd = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private infoText!: Phaser.GameObjects.Text;

  start(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = makeSparks(scene);
    if (!scene.textures.exists('scratch_brush')) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1).fillCircle(BRUSH, BRUSH, BRUSH);
      g.generateTexture('scratch_brush', BRUSH * 2, BRUSH * 2);
      g.destroy();
    }
    // 当たり表
    const tbl = scene.add.graphics();
    drawPlate(tbl, 70, 960 + OY, 580, 120, PAL.paper, { radius: 12, shadow: 6, outline: 4, shine: false });
    (['zeni', 'koban', 'kozuchi', 'neko'] as Sym[]).forEach((s, i) => {
      const x = 145 + i * 143;
      this.drawSym(tbl, x, 1000 + OY, s, 22);
      txt(scene, x, 1050 + OY, s === 'neko' ? '縁起物+20' : `+${SYMS[s].prize}`, 22, { color: CSS.ink });
    });
    this.infoText = txt(scene, 360, 1120 + OY, '', 26, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
    this.nextCard();
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  private drawSym(g: Phaser.GameObjects.Graphics, x: number, y: number, s: Sym, r: number) {
    g.fillStyle(PAL.ink, 1);
    g.fillCircle(x + 2, y + 3, r + 3);
    g.fillStyle(SYMS[s].face, 1);
    g.fillCircle(x, y, r);
    txt(this.scene, x, y + 1, SYMS[s].label, r * 1.1, { color: SYMS[s].ink });
  }

  private nextCard() {
    if (this.cardNo >= CARDS) return;
    this.cardNo += 1;
    this.infoText.setText(`${this.cardNo} / ${CARDS} 枚目`);
    const s = this.scene;
    const c = s.add.container(0, 0);
    const g = s.add.graphics();
    drawPlate(g, CARD.x - 300, CARD.y - 230, 600, 460, PAL.paper, { radius: 16, shadow: 9, outline: 5, shine: false });
    g.fillStyle(PAL.vermilion, 1);
    g.fillRect(CARD.x - 300, CARD.y - 230, 600, 70);
    c.add(g);
    c.add(txt(s, CARD.x, CARD.y - 195, '福だめし スクラッチ', 30, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }));
    const syms = makeCard();
    this.panels = syms.map((sym, i) => {
      const x = GX + (i % COLS) * (PW + GAP) + PW / 2;
      const y = GY + Math.floor(i / COLS) * (PH + GAP) + PH / 2;
      const pg = s.add.graphics();
      pg.fillStyle(0xf2e2c0, 1);
      pg.fillRoundedRect(x - PW / 2, y - PH / 2, PW, PH, 10);
      c.add(pg);
      const sg = s.add.graphics();
      sg.fillStyle(PAL.ink, 1);
      sg.fillCircle(x + 3, y + 4, 44);
      sg.fillStyle(SYMS[sym].face, 1);
      sg.fillCircle(x, y, 41);
      c.add(sg);
      c.add(txt(s, x, y + 2, SYMS[sym].label, 46, { color: SYMS[sym].ink }));
      return { sym, hits: new Set<number>(), open: false, x, y };
    });
    // 削る銀の膜
    const rt = s.add.renderTexture(GX, GY, GRID_W, GRID_H).setOrigin(0);
    const cg = s.make.graphics({}, false);
    for (const p of this.panels) {
      const lx = p.x - GX;
      const ly = p.y - GY;
      cg.fillStyle(0x9d97ab, 1);
      cg.fillRoundedRect(lx - PW / 2, ly - PH / 2, PW, PH, 10);
      cg.fillStyle(0xc4bfd0, 1);
      cg.fillRoundedRect(lx - PW / 2 + 6, ly - PH / 2 + 6, PW - 12, PH - 12, 8);
      cg.fillStyle(0xffffff, 0.25);
      for (let k = 0; k < 4; k++) cg.fillRect(lx - PW / 2 + 14 + k * 34, ly - PH / 2 + 10, 14, PH - 20);
    }
    rt.draw(cg);
    cg.destroy();
    c.add(rt);
    this.cover = rt;
    this.card = c;
    c.x = 800;
    s.tweens.add({ targets: c, x: 0, duration: 260, ease: 'Back.easeOut' });
    sfx.play('whoosh', { rate: 1.1 });
  }

  private scratch(x: number, y: number) {
    if (!this.cover || !this.card || this.card.x !== 0) return;
    this.cover.erase('scratch_brush', x - GX - BRUSH, y - GY - BRUSH);
    const now = this.scene.time.now;
    if (now - this.lastSnd > 70) {
      this.lastSnd = now;
      sfx.play('gari', { rate: 1.6 + Math.random() * 0.4, vol: 0.25 });
    }
    for (const p of this.panels) {
      if (p.open) continue;
      const lx = x - (p.x - PW / 2);
      const ly = y - (p.y - PH / 2);
      if (lx < -BRUSH || ly < -BRUSH || lx > PW + BRUSH || ly > PH + BRUSH) continue;
      // ブラシが届いた小区画を数える
      for (let i = 0; i < SUB; i++) {
        for (let j = 0; j < SUB; j++) {
          const cx = (i + 0.5) * (PW / SUB);
          const cy = (j + 0.5) * (PH / SUB);
          if (Math.hypot(cx - lx, cy - ly) < BRUSH + 6) p.hits.add(i * SUB + j);
        }
      }
      if (p.hits.size / (SUB * SUB) >= REVEAL_AT) this.openPanel(p);
    }
  }

  private openPanel(p: Panel) {
    p.open = true;
    // 残りの膜もまとめてはがす
    const g = this.scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillRect(p.x - PW / 2 - GX, p.y - PH / 2 - GY, PW, PH);
    this.cover?.erase(g);
    g.destroy();
    sfx.play('pop', { rate: 1.2, vol: 0.5 });
    vibrate(5);
    if (this.panels.every((q) => q.open)) this.judge();
  }

  private judge() {
    const counts = new Map<Sym, number>();
    for (const p of this.panels) counts.set(p.sym, (counts.get(p.sym) ?? 0) + 1);
    const win = [...counts.entries()].find(([, n]) => n >= 3)?.[0];
    this.coins += BASE_PAY;
    this.done += 1;
    const s = this.scene;
    if (win) {
      this.wins.push(win);
      this.coins += SYMS[win].prize;
      if (win === 'neko') this.gotNeko = true;
      sfx.play(win === 'neko' || win === 'kozuchi' ? 'fanfare' : 'sparkle');
      vibrate(25);
      for (const p of this.panels) if (p.sym === win) this.sparks.explode(12, p.x, p.y);
      stamp(s, 360, CARD.y - 40, win === 'neko' ? '招き猫！' : '当たり！', 64, CSS.gold, { hold: 500, depth: 900 });
      popText(s, 360, CARD.y + 80, win === 'neko' ? `縁起物と +${SYMS[win].prize}` : `+${SYMS[win].prize}`, CSS.gold, 40);
      if (win === 'kozuchi' || win === 'neko') s.cameras.main.shake(250, 0.006);
    } else {
      sfx.play('fail', { vol: 0.5 });
      popText(s, 360, CARD.y + 60, `ハズレ… 手間賃 +${BASE_PAY}`, CSS.cream);
    }
    const old = this.card;
    this.card = undefined;
    this.cover = undefined;
    s.time.delayedCall(1100, () => {
      if (old) s.tweens.add({ targets: old, x: -800, duration: 220, ease: 'Cubic.easeIn', onComplete: () => old.destroy() });
      s.time.delayedCall(180, () => this.nextCard());
    });
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.down = true;
    this.scratch(p.worldX, p.worldY);
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.down) return;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.worldX - p.prevPosition.x, p.worldY - p.prevPosition.y) / 16));
    for (let i = 1; i <= steps; i++) {
      this.scratch(Phaser.Math.Linear(p.prevPosition.x, p.worldX, i / steps), Phaser.Math.Linear(p.prevPosition.y, p.worldY, i / steps));
    }
  }

  private onUp() {
    this.down = false;
  }

  isDone(): boolean {
    if (this.done < CARDS) return false;
    // 最後の 1 枚の結果を見せてから終わる
    this.finishedAt ||= this.scene.time.now;
    return this.scene.time.now - this.finishedAt > 1300;
  }

  onEnd(): { coins: number; bonus?: Reward; summary?: string } {
    this.destroy();
    const names = this.wins.map((w) => SYMS[w].name);
    return {
      coins: this.coins,
      bonus: this.gotNeko ? { kind: 'relic' } : undefined,
      summary: `削った ${this.done} 枚 / 当たり ${this.wins.length}${names.length ? `（${names.join('・')}）` : ''}`,
    };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
  }
}
