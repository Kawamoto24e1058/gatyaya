// 相場で売る（出店）。入場で 1AP 消費済み。出店中は何個でも売れ、店に戻ると店じまい。
// TODO(仕様確認): 「出店」を 1 日 1 回とみなすか、入るたびに 1AP かは未確定。現状は入るたびに 1AP。
import Phaser from 'phaser';
import { CSS, GAME_W } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { PRIZE_BY_ID, SERIES, SERIES_BY_ID } from '../data/prizes';
import { RARITY_INFO } from '../data/rarity';
import { estimateSellTotal, saturationOf, sellOne, sellPrice, trendIcon, trendSign } from '../game/market';
import { S, save } from '../game/state';
import { Hud } from '../ui/Hud';
import { Button, panel, txt } from '../ui/widgets';

const LIST = { top: 420, bottom: 1110, colW: 216, rowH: 118, x0: 24 };

const MODE_LABEL = { normal: '', boom: 'ブーム', bored: '飽き気味' } as const;

export class MarketScene extends Phaser.Scene {
  private hud!: Hud;
  private list!: Phaser.GameObjects.Container;
  private ids: string[] = [];
  private scrollY = 0;
  private drag: { id: number; startY: number; startScroll: number; moved: boolean } | null = null;
  private detail: Phaser.GameObjects.Container | null = null;
  private detailId: string | null = null;

  constructor() {
    super('Market');
  }

  create() {
    this.detail = null;
    this.detailId = null;
    this.drag = null;
    this.scrollY = 0;

    const bg = this.add.graphics();
    bg.fillStyle(0x2d2148, 1);
    bg.fillRect(0, 0, GAME_W, 1280);
    // 屋台の日よけ
    for (let i = 0; i < 18; i++) {
      bg.fillStyle(i % 2 ? 0xfff6e6 : 0xff5a7a, 1);
      bg.fillRect(i * 40, 118, 40, 22);
      bg.fillCircle(i * 40 + 20, 140, 20);
    }

    this.hud = new Hud(this);
    this.buildSeriesBoard();

    txt(this, 26, 396, '在庫（タップで値段を見る）', 22, { originX: 0, color: CSS.sub, bold: false });
    this.list = this.add.container(0, LIST.top);
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff);
    maskG.fillRect(0, LIST.top, GAME_W, LIST.bottom - LIST.top);
    this.list.setMask(maskG.createGeometryMask());
    this.renderList();

    new Button(this, 360, 1196, {
      w: 420,
      h: 108,
      color: 0xff5a7a,
      label: '店じまいして戻る',
      size: 32,
      onPress: () => this.leave(),
    });

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
  }

  private buildSeriesBoard() {
    const s = S();
    panel(this, 360, 272, 680, 220, 0x1b1430, 20);
    SERIES.forEach((se, i) => {
      const y = 196 + i * 68;
      const sm = s.market.series[se.id];
      const col = Phaser.Display.Color.HexStringToColor(se.color).color;
      const g = this.add.graphics();
      g.fillStyle(col, 1);
      g.fillRoundedRect(46, y - 20, 16, 40, 6);
      txt(this, 80, y, se.name, 30, { originX: 0 });
      const sign = trendSign(sm);
      const color = sm.mode === 'boom' ? CSS.gold : sign === 'up' ? CSS.good : sign === 'down' ? CSS.bad : CSS.sub;
      const icon = txt(this, 630, y, trendIcon(sm), 44, { originX: 1, color });
      if (MODE_LABEL[sm.mode]) txt(this, 530, y, MODE_LABEL[sm.mode], 22, { originX: 1, color, bold: false });
      if (sm.mode === 'boom') this.tweens.add({ targets: icon, scale: 1.15, duration: 380, yoyo: true, repeat: -1 });
    });
  }

  private sortedIds(): string[] {
    const inv = S().inventory;
    return Object.keys(inv)
      .filter((id) => inv[id] > 0)
      .sort((a, b) => {
        const pa = PRIZE_BY_ID[a];
        const pb = PRIZE_BY_ID[b];
        return RARITY_INFO[pb.rarity].index - RARITY_INFO[pa.rarity].index || pa.seriesId.localeCompare(pb.seriesId) || a.localeCompare(b);
      });
  }

  private renderList() {
    this.list.removeAll(true);
    this.ids = this.sortedIds();
    const s = S();
    if (this.ids.length === 0) {
      this.list.add(txt(this, 360, 200, '売れる景品がありません', 28, { color: CSS.sub }));
    }
    this.ids.forEach((id, i) => {
      const p = PRIZE_BY_ID[id];
      const se = SERIES_BY_ID[p.seriesId];
      const info = RARITY_INFO[p.rarity];
      const x = LIST.x0 + (i % 3) * (LIST.colW + 12);
      const y = Math.floor(i / 3) * LIST.rowH;
      const g = this.add.graphics();
      g.fillStyle(0xfff6e6, 1);
      g.fillRoundedRect(x, y, LIST.colW, LIST.rowH - 12, 16);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(se.color).color, 1);
      g.fillRoundedRect(x, y, 14, LIST.rowH - 12, { tl: 16, bl: 16, tr: 0, br: 0 });
      g.lineStyle(4, info.color, 1);
      g.strokeRoundedRect(x, y, LIST.colW, LIST.rowH - 12, 16);
      const rb = txt(this, x + 26, y + 22, p.rarity, 22, { originX: 0, color: info.css, stroke: '#2a1f45', strokeThickness: 4 });
      const sm = s.market.series[p.seriesId];
      const arrow = txt(this, x + LIST.colW - 12, y + 22, trendIcon(sm), 22, {
        originX: 1,
        color: sm.mode === 'boom' ? '#e08a00' : trendSign(sm) === 'up' ? '#1f9e5a' : trendSign(sm) === 'down' ? '#d63a3a' : '#8a80a6',
      });
      const name = txt(this, x + 26, y + 62, p.name, p.name.length > 7 ? 19 : 23, {
        originX: 0,
        color: CSS.ink,
        align: 'left',
        wrap: LIST.colW - 70,
      });
      const cnt = txt(this, x + LIST.colW - 12, y + 80, `×${s.inventory[id]}`, 26, { originX: 1, color: CSS.ink });
      this.list.add([g, rb, arrow, name, cnt]);
    });
    this.clampScroll();
  }

  private maxScroll() {
    const rows = Math.ceil(this.ids.length / 3);
    return Math.max(0, rows * LIST.rowH - (LIST.bottom - LIST.top));
  }

  private clampScroll() {
    this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll());
    this.list.y = LIST.top - this.scrollY;
  }

  // ---- 入力（リストはスクロールと区別するため指を離したときに選択） ----

  private onDown(p: Phaser.Input.Pointer) {
    if (this.detail || this.drag) return;
    if (p.worldY < LIST.top || p.worldY > LIST.bottom) return;
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
    const lx = p.worldX - LIST.x0;
    const ly = p.worldY - LIST.top + this.scrollY;
    const col = Math.floor(lx / (LIST.colW + 12));
    const row = Math.floor(ly / LIST.rowH);
    if (col < 0 || col > 2 || lx - col * (LIST.colW + 12) > LIST.colW) return;
    const id = this.ids[row * 3 + col];
    if (id) {
      sfx.play('tap');
      this.openDetail(id);
    }
  }

  // ---- 詳細パネル（数値はここでだけ出す） ----

  private openDetail(id: string) {
    this.detail?.destroy();
    const s = S();
    const p = PRIZE_BY_ID[id];
    const se = SERIES_BY_ID[p.seriesId];
    const info = RARITY_INFO[p.rarity];
    const sm = s.market.series[p.seriesId];
    const have = s.inventory[id] ?? 0;
    if (have <= 0) {
      this.detail = null;
      return;
    }

    const c = this.add.container(0, 0).setDepth(700);
    const shade = this.add.rectangle(360, 640, GAME_W, 1280, 0x000000, 0.55).setInteractive();
    shade.on('pointerdown', () => this.closeDetail());
    c.add(shade);
    const pg = panel(this, 360, 700, 620, 640);
    c.add(pg);
    const band = this.add.graphics();
    band.fillStyle(Phaser.Display.Color.HexStringToColor(se.color).color, 1);
    band.fillRoundedRect(50, 380, 620, 64, { tl: 24, tr: 24, bl: 0, br: 0 });
    c.add(band);
    c.add(txt(this, 80, 412, se.name, 26, { originX: 0, stroke: '#2a1f45', strokeThickness: 5 }));
    c.add(txt(this, 640, 412, p.rarity, 30, { originX: 1, color: info.css, stroke: '#2a1f45', strokeThickness: 6 }));
    c.add(txt(this, 360, 490, p.name, 38, { color: CSS.ink, wrap: 560 }));
    c.add(txt(this, 360, 540, `所持 ×${have}`, 24, { color: '#6b5f8a', bold: false }));

    const price = sellPrice(s, id);
    c.add(txt(this, 360, 600, '1個の売値', 22, { color: '#6b5f8a', bold: false }));
    c.add(txt(this, 360, 646, fmt(price), 60, { color: '#d18a00' }));
    const sat = saturationOf(s.market, id);
    const detailLine = `基準 ${fmt(p.basePrice)}  ・  相場 ×${sm.trend.toFixed(2)} ${trendIcon(sm)}  ・  値崩れ ×${sat.toFixed(2)}`;
    c.add(txt(this, 360, 704, detailLine, 20, { color: '#6b5f8a', bold: false }));
    // TODO(Phase 2): イベント係数・レリック補正の内訳表示

    const total = estimateSellTotal(s, id, have);
    const b1 = new Button(this, 210, 800, {
      w: 260,
      h: 104,
      color: 0x4fd18b,
      label: '1個売る',
      sub: `+${fmt(price)}`,
      size: 30,
      onPress: () => this.sell(id, 1),
    });
    const b2 = new Button(this, 510, 800, {
      w: 260,
      h: 104,
      color: 0xffa531,
      label: `全部売る`,
      sub: `×${have} → +${fmt(total)}`,
      size: 30,
      onPress: () => this.sell(id, have),
    });
    const b3 = new Button(this, 360, 930, { w: 300, h: 80, color: 0x8a80a6, label: '閉じる', size: 28, onPress: () => this.closeDetail() });
    c.add([b1, b2, b3]);
    c.setScale(0.96).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 120, ease: 'Back.easeOut' });
    this.detail = c;
    this.detailId = id;
  }

  private closeDetail() {
    this.detail?.destroy();
    this.detail = null;
    this.detailId = null;
  }

  private sell(id: string, n: number) {
    const s = S();
    let earned = 0;
    for (let i = 0; i < n; i++) earned += sellOne(s, id);
    if (earned <= 0) return;
    save();
    sfx.play('coin', { rate: n > 1 ? 1.05 : 1 });
    if (n > 3) sfx.play('coin', { delay: 0.09, rate: 1.12, vol: 0.7 });
    this.flyCoins(Math.min(12, 3 + n), 360, 800);
    this.time.delayedCall(380, () => this.hud.refresh(true));
    this.renderList();
    // 押したボタン自身を破棄するので、入力処理が終わってから作り直す
    this.time.delayedCall(0, () => {
      if ((s.inventory[id] ?? 0) > 0 && this.detailId === id) this.openDetail(id);
      else this.closeDetail();
    });
  }

  private flyCoins(n: number, x: number, y: number) {
    const t = this.hud.coinTarget();
    for (let i = 0; i < n; i++) {
      const c = this.add.image(x + Phaser.Math.Between(-60, 60), y + Phaser.Math.Between(-30, 30), 'coin').setDepth(900);
      this.tweens.add({
        targets: c,
        x: t.x,
        y: t.y,
        scale: 0.6,
        delay: i * 35,
        duration: 380,
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
