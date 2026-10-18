// 相場で売る（出店）。入場で 1AP 消費済み。出店中は何個でも売れ、店に戻ると店じまい。
// TODO(仕様確認): 「出店」を 1 日 1 回とみなすか、入るたびに 1AP かは未確定。現状は入るたびに 1AP。
// 見た目：トレカ屋のショーケース＋黒板の相場ボード。数値は景品をタップしたときだけ出す。
import Phaser from 'phaser';
import { BOTTOM, CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { parseStock, SERIES, SHINY_MULT } from '../data/prizes';
import { RARITY_INFO } from '../data/rarity';
import { activeOn, DARK_CATCH_RATE, EVENT_DEFS, eventMult, isBanned } from '../game/events';
import { darkPrice, estimateSellTotal, saturationOf, sellDark, sellOne, sellPrice, trendSign, type SeriesMarket } from '../game/market';
import { runHook } from '../game/relics';
import { S, save } from '../game/state';
import { Hud } from '../ui/Hud';
import { ITEM_Y, makePrizeView, twinkle, VIEW_H, VIEW_W } from '../ui/PrizeView';
import { Button, drawPlate, floatText, stamp, txt } from '../ui/widgets';

const COLS = 3;
const VIEW_SCALE = 0.62;
const GAP = 14;

/** 黒板に描くチョーク風の矢印・炎 */
function drawTrendMark(g: Phaser.GameObjects.Graphics, x: number, y: number, sm: SeriesMarket) {
  const sign = trendSign(sm);
  const col = sign === 'up' ? 0x9be0a4 : sign === 'down' ? 0xf2a0b4 : 0xd8d4cc;
  g.lineStyle(8, col, 1);
  g.beginPath();
  if (sign === 'flat') {
    g.moveTo(x - 22, y);
    g.lineTo(x + 18, y);
    g.strokePath();
    g.fillStyle(col, 1);
    g.fillTriangle(x + 14, y - 12, x + 30, y, x + 14, y + 12);
  } else {
    const d = sign === 'up' ? -1 : 1;
    g.moveTo(x - 20, y - d * 16);
    g.lineTo(x + 14, y + d * 12);
    g.strokePath();
    g.fillStyle(col, 1);
    g.fillTriangle(x + 4, y + d * 22, x + 26, y + d * 22, x + 22, y + d * -2);
  }
  if (sm.mode === 'boom') {
    // 炎
    const fx = x - 50;
    g.fillStyle(0xf08a4b, 1);
    g.fillTriangle(fx - 14, y + 16, fx + 14, y + 16, fx, y - 22);
    g.fillCircle(fx, y + 8, 14);
    g.fillStyle(0xf6d58a, 1);
    g.fillCircle(fx, y + 10, 7);
  }
}

export class MarketScene extends Phaser.Scene {
  private hud!: Hud;
  private list!: Phaser.GameObjects.Container;
  private ids: string[] = [];
  private scrollY = 0;
  private drag: { id: number; startY: number; startScroll: number; moved: boolean } | null = null;
  private detail: Phaser.GameObjects.Container | null = null;
  private detailId: string | null = null;
  private area = { top: 0, bottom: 0, x0: 0, cellW: 0, cellH: 0 };

  constructor() {
    super('Market');
  }

  create() {
    this.detail = null;
    this.detailId = null;
    this.drag = null;
    this.scrollY = 0;

    this.add.image(0, 0, 'bg_plum').setOrigin(0);
    this.hud = new Hud(this);
    const top = Hud.bottom();

    // のれん風の日よけ
    const awn = this.add.graphics().setDepth(10);
    for (let i = 0; i < 9; i++) {
      awn.fillStyle(i % 2 ? PAL.paper : PAL.vermilion, 1);
      awn.fillRect(i * 80, top, 80, 26);
      awn.fillCircle(i * 80 + 40, top + 26, 40 / 2);
    }
    awn.fillStyle(PAL.ink, 1);
    awn.fillRect(0, top, GAME_W, 5);

    const boardBottom = this.buildBoard(top + 60);

    const btnY = BOTTOM - 70;
    const caseTop = boardBottom + 36;
    const caseBottom = btnY - 80;
    this.buildCase(caseTop, caseBottom);

    new Button(this, 360, btnY, {
      w: 440,
      h: 104,
      color: PAL.vermilion,
      icon: 'ic_close',
      label: '店じまいして戻る',
      size: 30,
      onPress: () => this.leave(),
    });

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
  }

  /** 黒板の相場ボード。戻り値は下端 */
  private buildBoard(y: number): number {
    const s = S();
    const h = 52 + SERIES.length * 66;
    const g = this.add.graphics();
    drawPlate(g, 30, y, 660, h, PAL.wood, { radius: 14, shadow: 7, outline: 5, shine: false });
    g.fillStyle(0x2f4a3a, 1);
    g.fillRoundedRect(44, y + 14, 632, h - 28, 8);
    // チョークの擦れ
    g.fillStyle(0xffffff, 0.05);
    for (let i = 0; i < 6; i++) g.fillEllipse(120 + i * 100, y + 30 + (i % 3) * 40, 140, 26);
    txt(this, 64, y + 40, '今日の相場', 26, { originX: 0, color: '#e8e4d6' });
    txt(this, 656, y + 40, 'タップで値段', 18, { originX: 1, color: '#b9c8b8', bold: false });
    const marks = this.add.graphics();
    SERIES.forEach((se, i) => {
      const ry = y + 92 + i * 66;
      const sm = s.market.series[se.id];
      const col = Phaser.Display.Color.HexStringToColor(se.color).color;
      g.fillStyle(col, 0.9);
      g.fillRoundedRect(66, ry - 18, 14, 36, 4);
      txt(this, 96, ry, se.name, 26, { originX: 0, color: '#f2efe4' });
      this.drawWeekBars(marks, 330, ry, sm);
      // かかっているイベント（📺 🏭 ⚠ 🚫）
      const evs = activeOn(s, se.id);
      if (evs.length > 0) {
        const icons = txt(this, 322, ry, evs.map((e) => EVENT_DEFS[e.type].icon).join(''), 24, { originX: 1 });
        this.tweens.add({ targets: icons, scale: 1.15, duration: 420, yoyo: true, repeat: -1 });
      }
      drawTrendMark(marks, 626, ry, sm);
    });
    return y + h;
  }

  /** 今週の値動き（チョークの棒グラフ）。未来の日は「?」 */
  private drawWeekBars(g: Phaser.GameObjects.Graphics, x0: number, y: number, sm: SeriesMarket) {
    const bw = 20;
    const gap = 6;
    const base = y + 26;
    // 基準線（×1.0 の高さ）
    const h1 = 28;
    g.lineStyle(2, 0xe8e4d6, 0.4);
    g.lineBetween(x0 - 4, base - h1, x0 + 7 * (bw + gap), base - h1);
    for (let i = 0; i < 7; i++) {
      const x = x0 + i * (bw + gap);
      if (i > sm.dayIdx) {
        g.fillStyle(0xe8e4d6, 0.3);
        g.fillCircle(x + bw / 2, base - 6, 3);
        continue;
      }
      const v = sm.curve[i];
      // ×6 まで枠内に収まるよう高い側を圧縮
      const h = Phaser.Math.Clamp(h1 * Math.pow(v, 0.6), 6, 52);
      const col = v >= 1.8 ? 0xf6c48a : v >= 1 ? 0x9be0a4 : 0xf2a0b4;
      g.fillStyle(col, i === sm.dayIdx ? 1 : 0.6);
      g.fillRect(x, base - h, bw, h);
      if (i === sm.dayIdx) {
        g.lineStyle(3, 0xffffff, 0.9);
        g.strokeRect(x - 2, base - h - 2, bw + 4, h + 4);
      }
    }
  }

  /** ガラスのショーケース */
  private buildCase(top: number, bottom: number) {
    const g = this.add.graphics();
    drawPlate(g, 22, top, 676, bottom - top, PAL.woodDark, { radius: 18, shadow: 8, outline: 5, shine: false });
    g.fillStyle(0x1a1020, 1);
    g.fillRoundedRect(36, top + 14, 648, bottom - top - 28, 10);
    // 棚板
    const cellW = VIEW_W * VIEW_SCALE;
    const cellH = VIEW_H * VIEW_SCALE + 30;
    const x0 = (GAME_W - (COLS * cellW + (COLS - 1) * GAP)) / 2;
    this.area = { top: top + 20, bottom: bottom - 20, x0, cellW, cellH };
    txt(this, 360, top - 2, '在庫', 24, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }).setDepth(5);

    this.list = this.add.container(0, this.area.top);
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff);
    maskG.fillRect(36, this.area.top, 648, this.area.bottom - this.area.top);
    this.list.setMask(maskG.createGeometryMask());

    // ガラスの反射（手前）
    const glass = this.add.graphics().setDepth(20);
    glass.fillStyle(0xffffff, 0.06);
    glass.fillTriangle(36, top + 14, 260, top + 14, 36, top + 260);
    glass.fillStyle(0xffffff, 0.05);
    glass.fillRect(560, top + 14, 18, bottom - top - 28);
    this.renderList();
  }

  private sortedIds(): string[] {
    const inv = S().inventory;
    return Object.keys(inv)
      .filter((id) => inv[id] > 0)
      .sort((a, b) => {
        const pa = parseStock(a).prize;
        const pb = parseStock(b).prize;
        return RARITY_INFO[pb.rarity].index - RARITY_INFO[pa.rarity].index || pa.seriesId.localeCompare(pb.seriesId) || a.localeCompare(b);
      });
  }

  private renderList() {
    this.list.removeAll(true);
    this.ids = this.sortedIds();
    const s = S();
    const A = this.area;
    if (this.ids.length === 0) {
      this.list.add(txt(this, 360, 120, 'ショーケースは空っぽ…', 28, { color: CSS.sub }));
    }
    this.ids.forEach((id, i) => {
      const { prize: p, shiny } = parseStock(id);
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = A.x0 + col * (A.cellW + GAP) + A.cellW / 2;
      const cy = row * A.cellH + (-ITEM_Y + 110) * VIEW_SCALE + 8;
      // 棚板
      if (col === 0) {
        const shelf = this.add.graphics();
        shelf.fillStyle(PAL.wood, 1);
        shelf.fillRect(36, cy + (ITEM_Y + 104) * VIEW_SCALE, 648, 10);
        shelf.fillStyle(PAL.ink, 1);
        shelf.fillRect(36, cy + (ITEM_Y + 104) * VIEW_SCALE + 10, 648, 3);
        this.list.add(shelf);
      }
      const card = makePrizeView(this, p, { count: s.inventory[id], shiny });
      card.setPosition(cx, cy).setScale(VIEW_SCALE);
      this.list.add(card);
      // 値動きの小札（シリーズ単位の矢印）
      const sm = s.market.series[p.seriesId];
      const sign = trendSign(sm);
      const banned = isBanned(s, p.seriesId);
      const mark = banned ? '🚫' : sm.mode === 'boom' ? '🔥' : sign === 'up' ? '↑' : sign === 'down' ? '↓' : '→';
      const tagColor = banned ? PAL.ink : sm.mode === 'boom' ? PAL.mustard : sign === 'up' ? PAL.moss : sign === 'down' ? PAL.vermilion : 0x8a7f9a;
      const tg = this.add.graphics();
      const ty = cy + (ITEM_Y - 110) * VIEW_SCALE;
      drawPlate(tg, cx - A.cellW / 2 - 4, ty, 46, 38, tagColor, { radius: 8, shadow: 3, outline: 3, shine: false });
      this.list.add(tg);
      this.list.add(txt(this, cx - A.cellW / 2 + 19, ty + 19, mark, 24, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 4 }));
    });
    this.clampScroll();
  }

  private maxScroll() {
    const rows = Math.ceil(this.ids.length / COLS);
    return Math.max(0, rows * this.area.cellH + 20 - (this.area.bottom - this.area.top));
  }

  private clampScroll() {
    this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll());
    this.list.y = this.area.top - this.scrollY;
  }

  // ---- 入力（リストはスクロールと区別するため指を離したときに選択） ----

  private onDown(p: Phaser.Input.Pointer) {
    if (this.detail || this.drag) return;
    if (p.worldY < this.area.top || p.worldY > this.area.bottom) return;
    this.drag = { id: p.id, startY: p.worldY, startScroll: this.scrollY, moved: false };
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.drag || p.id !== this.drag.id) return;
    const dy = p.worldY - this.drag.startY;
    if (Math.abs(dy) > 10) this.drag.moved = true;
    if (this.drag.moved) {
      this.scrollY = this.drag.startScroll - dy;
      this.clampScroll();
    }
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (!this.drag || p.id !== this.drag.id) return;
    const moved = this.drag.moved;
    this.drag = null;
    if (moved) return;
    const A = this.area;
    const lx = p.worldX - A.x0;
    const ly = p.worldY - A.top + this.scrollY;
    const col = Math.floor(lx / (A.cellW + GAP));
    const row = Math.floor(ly / A.cellH);
    if (col < 0 || col >= COLS || lx - col * (A.cellW + GAP) > A.cellW) return;
    const id = this.ids[row * COLS + col];
    if (id) {
      sfx.play('flip', { rate: 1.3, vol: 0.6 });
      this.openDetail(id);
    }
  }

  // ---- 詳細パネル（数値はここでだけ出す） ----

  private openDetail(id: string, animate = true) {
    this.detail?.destroy();
    const s = S();
    const { prize: p, shiny } = parseStock(id);
    const sm = s.market.series[p.seriesId];
    const have = s.inventory[id] ?? 0;
    if (have <= 0) {
      this.detail = null;
      return;
    }

    const c = this.add.container(0, 0).setDepth(700);
    const shade = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.75).setInteractive();
    shade.on('pointerdown', () => this.closeDetail());
    c.add(shade);

    const midY = GAME_H / 2;
    // 大きなカード
    const card = makePrizeView(this, p, { count: have, shiny });
    card.setPosition(360, midY - 300).setScale(1.25);
    c.add(card);

    // 値札（紐でぶら下がる紙）
    const tagY = midY + 20;
    const tg = this.add.graphics();
    tg.lineStyle(4, PAL.ink, 1);
    tg.lineBetween(360, tagY - 120, 360, tagY - 70);
    drawPlate(tg, 150, tagY - 70, 420, 170, PAL.paper, { radius: 14, shadow: 7, outline: 5, shine: false });
    tg.fillStyle(PAL.ink, 1);
    tg.fillCircle(360, tagY - 54, 7);
    c.add(tg);
    const price = sellPrice(s, id);
    c.add(txt(this, 360, tagY - 22, '1個の売値', 22, { color: CSS.inkSoft }));
    c.add(txt(this, 360, tagY + 26, fmt(price), 64, { color: CSS.bad }));
    const sat = saturationOf(s.market, id);
    const evMult = eventMult(s, p.seriesId);
    const detailLine = `基準 ${fmt(p.basePrice)}${shiny ? ` × 色違い ${SHINY_MULT}` : ''} × 相場 ${sm.trend.toFixed(2)}${evMult !== 1 ? ` × イベント ${evMult.toFixed(1)}` : ''} × 値崩れ ${sat.toFixed(2)}`;
    c.add(txt(this, 360, tagY + 76, detailLine, 17, { color: CSS.inkSoft, bold: false, wrap: 400 }));
    // TODO: 縁起物補正の内訳表示

    const total = estimateSellTotal(s, id, have);
    const by = tagY + 200;
    if (isBanned(s, p.seriesId)) {
      // 販売禁止：表では売れない。闇ルートなら半値で、摘発の危険あり
      const dark = darkPrice(s, id);
      const catchRate = Math.round(runHook(s, 'onDarkCatch', DARK_CATCH_RATE) * 100);
      c.add(stamp(this, 360, tagY + 26, '販売禁止', 56, CSS.bad, { hold: Infinity, angle: -10, depth: 0 }));
      const bd = new Button(this, 360, by, {
        w: 480,
        h: 108,
        color: PAL.blood,
        label: '闇ルートで1個売る',
        sub: `+${fmt(dark)}（摘発 ${catchRate}%）`,
        size: 30,
        onPress: () => this.sellDarkOne(id),
      });
      const bc = new Button(this, 360, by + 130, { w: 260, h: 80, color: PAL.plum, label: '閉じる', size: 28, onPress: () => this.closeDetail() });
      c.add([bd, bc]);
      this.detail = c;
      this.detailId = id;
      return;
    }
    const b1 = new Button(this, 210, by, {
      w: 270,
      h: 108,
      color: PAL.moss,
      label: '1個売る',
      sub: `+${fmt(price)}`,
      size: 30,
      onPress: () => this.sell(id, 1),
    });
    const b2 = new Button(this, 510, by, {
      w: 270,
      h: 108,
      color: PAL.mustard,
      label: '全部売る',
      sub: `×${have} → +${fmt(total)}`,
      size: 30,
      onPress: () => this.sell(id, have),
    });
    const b3 = new Button(this, 360, by + 130, { w: 260, h: 80, color: PAL.plum, label: '閉じる', size: 28, onPress: () => this.closeDetail() });
    c.add([b1, b2, b3]);
    if (animate) {
      card.setScale(0.2).setAngle(-30);
      this.tweens.add({ targets: card, scale: 1.25, angle: 0, duration: 260, ease: 'Back.easeOut' });
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, duration: 140 });
    }
    twinkle(this, card, RARITY_INFO[p.rarity].index);
    this.detail = c;
    this.detailId = id;
  }

  private closeDetail() {
    this.detail?.destroy();
    this.detail = null;
    this.detailId = null;
  }

  private sellDarkOne(id: string) {
    const s = S();
    const r = sellDark(s, id);
    save();
    const ox = 360;
    const oy = GAME_H / 2 + 20;
    if (r.caught) {
      sfx.play('buzz');
      sfx.play('stamp');
      this.cameras.main.shake(300, 0.01);
      stamp(this, ox, oy - 60, '摘発！', 72, CSS.bad, { hold: 900, depth: 1000 });
      floatText(this, ox, oy + 40, `罰金 -${fmt(r.fine)}`, CSS.bad, 40);
    } else {
      sfx.play('coin', { rate: 0.8 });
      this.flyCoins(4, ox, oy);
      floatText(this, ox, oy - 100, `+${fmt(r.earned)}（闇）`, CSS.gold, 40);
    }
    this.time.delayedCall(380, () => this.hud.refresh(true));
    this.renderList();
    this.time.delayedCall(0, () => {
      if ((s.inventory[id] ?? 0) > 0 && this.detailId === id) this.openDetail(id, false);
      else this.closeDetail();
    });
  }

  private sell(id: string, n: number) {
    const s = S();
    let earned = 0;
    for (let i = 0; i < n; i++) earned += sellOne(s, id);
    if (earned <= 0) return;
    save();
    sfx.play('coin', { rate: n > 1 ? 1.05 : 1 });
    if (n > 3) sfx.play('coin', { delay: 0.09, rate: 1.12, vol: 0.7 });
    sfx.play('stamp', { vol: 0.5, delay: 0.05 });
    const ox = 360;
    const oy = GAME_H / 2 + 20;
    this.flyCoins(Math.min(14, 3 + n), ox, oy);
    floatText(this, ox, oy - 100, `+${fmt(earned)}`, CSS.gold, 46);
    this.time.delayedCall(380, () => this.hud.refresh(true));
    this.renderList();
    // 押したボタン自身を破棄するので、入力処理が終わってから作り直す
    this.time.delayedCall(0, () => {
      if ((s.inventory[id] ?? 0) > 0 && this.detailId === id) this.openDetail(id, false);
      else this.closeDetail();
    });
  }

  private flyCoins(n: number, x: number, y: number) {
    const t = this.hud.coinTarget();
    for (let i = 0; i < n; i++) {
      const c = this.add.image(x + Phaser.Math.Between(-70, 70), y + Phaser.Math.Between(-30, 30), 'coin').setDepth(900);
      this.tweens.add({
        targets: c,
        x: t.x,
        y: t.y,
        scale: 0.6,
        delay: i * 35,
        duration: 420,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          c.destroy();
          sfx.play('tick', { rate: 1.6 + Math.random() * 0.2, vol: 0.4 });
        },
      });
    }
  }

  private leave() {
    sfx.play('whoosh');
    this.input.off('pointerdown', this.onDown, this);
    this.input.off('pointermove', this.onMove, this);
    this.input.off('pointerup', this.onUp, this);
    this.scene.stop();
    this.scene.wake('Shop');
  }
}
