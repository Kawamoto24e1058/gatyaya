import Phaser from 'phaser';
import { CSS, FONT, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';

export type TextOpts = {
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  stroke?: string;
  strokeThickness?: number;
  wrap?: number;
  originX?: number;
  originY?: number;
  /** ベタ影（ポップな見出し用） */
  shadow?: boolean;
};

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, size: number, o: TextOpts = {}) {
  const t = scene.add.text(x, y, s, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color: o.color ?? CSS.white,
    fontStyle: o.bold === false ? 'normal' : 'bold',
    align: o.align ?? 'center',
    stroke: o.stroke,
    strokeThickness: o.strokeThickness ?? (o.stroke ? 6 : 0),
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
    padding: { top: 6, bottom: 6, left: 4, right: 4 },
    shadow: o.shadow ? { offsetX: 0, offsetY: Math.max(3, size / 10), color: CSS.ink, blur: 0, fill: true, stroke: true } : undefined,
  });
  t.setOrigin(o.originX ?? 0.5, o.originY ?? 0.5);
  return t;
}

/** ポップな見出し文字（墨のフチ＋ベタ影） */
export function title(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: string = CSS.cream) {
  return txt(scene, x, y, s, size, { color, stroke: CSS.ink, strokeThickness: Math.max(6, size / 6), shadow: true });
}

/** 墨の輪郭＋ずらしたベタ影の板（紙・木札など） */
export function drawPlate(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  opts: { radius?: number; shadow?: number; outline?: number; shine?: boolean } = {},
) {
  const r = opts.radius ?? 20;
  const sh = opts.shadow ?? 7;
  const ol = opts.outline ?? 5;
  if (sh > 0) {
    g.fillStyle(PAL.ink, 0.9);
    g.fillRoundedRect(x, y + sh, w, h, r);
  }
  g.fillStyle(PAL.ink, 1);
  g.fillRoundedRect(x - ol, y - ol, w + ol * 2, h + ol * 2, r + ol);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x, y, w, h, r);
  if (opts.shine !== false) {
    g.fillStyle(0xffffff, 0.16);
    g.fillRoundedRect(x + 8, y + 6, w - 16, Math.min(h * 0.32, 26), Math.max(4, r - 6));
  }
}

export type ButtonOpts = {
  w: number;
  h: number;
  color: number;
  label: string;
  sub?: string;
  size?: number;
  textColor?: string;
  icon?: string;
  onPress: () => void;
  /** 押せないときに呼ばれる（理由のトーストなど） */
  onDenied?: () => void;
};

/** pointerdown で即反応する木札風ボタン。押すと沈む */
export class Button extends Phaser.GameObjects.Container {
  private face: Phaser.GameObjects.Container;
  private label: Phaser.GameObjects.Text;
  private subText?: Phaser.GameObjects.Text;
  private _enabled = true;
  private pulseTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    o: ButtonOpts,
  ) {
    super(scene, x, y);
    const { w, h } = o;
    const shadow = scene.add.graphics();
    shadow.fillStyle(PAL.ink, 1);
    shadow.fillRoundedRect(-w / 2 - 5, -h / 2 + 3, w + 10, h + 10, 24);
    this.face = scene.add.container(0, 0);
    const bg = scene.add.graphics();
    drawPlate(bg, -w / 2, -h / 2, w, h, o.color, { shadow: 0, radius: 20 });
    // 下側を少し暗く（厚みの表現）
    bg.fillStyle(0x000000, 0.14);
    bg.fillRoundedRect(-w / 2, h / 2 - 12, w, 12, { tl: 0, tr: 0, bl: 20, br: 20 });
    this.face.add(bg);

    const size = o.size ?? 32;
    const tc = o.textColor ?? CSS.cream;
    let tx = 0;
    if (o.icon) {
      const ic = scene.add.image(-w / 2 + 44, 0, o.icon).setScale(Math.min(1, (h - 30) / 64));
      this.face.add(ic);
      tx = 30;
    }
    this.label = txt(scene, tx, o.sub ? -13 : 0, o.label, size, { color: tc, stroke: CSS.ink, strokeThickness: 6 });
    this.face.add(this.label);
    if (o.sub) {
      this.subText = txt(scene, tx, 24, o.sub, 21, { color: tc, stroke: CSS.ink, strokeThickness: 4 });
      this.face.add(this.subText);
    }
    this.add([shadow, this.face]);
    this.setSize(w + 10, h + 10);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (!this._enabled) {
        sfx.play('buzz', { vol: 0.5 });
        this.scene.tweens.add({ targets: this.face, x: 6, duration: 40, yoyo: true, repeat: 2 });
        o.onDenied?.();
        return;
      }
      sfx.play('tap');
      this.scene.tweens.killTweensOf(this.face);
      this.face.y = 7;
      this.scene.tweens.add({ targets: this.face, y: 0, duration: 140, delay: 40, ease: 'Back.easeOut' });
      o.onPress();
    });
    scene.add.existing(this);
  }

  setLabel(label: string, sub?: string) {
    this.label.setText(label);
    if (sub !== undefined) this.subText?.setText(sub);
    return this;
  }

  setEnabled(e: boolean) {
    this._enabled = e;
    this.face.setAlpha(e ? 1 : 0.5);
    return this;
  }

  get enabled() {
    return this._enabled;
  }

  setPulse(on: boolean) {
    if (on && !this.pulseTween) {
      this.pulseTween = this.scene.tweens.add({
        targets: this,
        scale: 1.06,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!on && this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = undefined;
      this.setScale(1);
    }
  }
}

/** 紙のパネル（中心座標指定） */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number = PAL.paper, radius = 24) {
  const g = scene.add.graphics();
  drawPlate(g, x - w / 2, y - h / 2, w, h, color, { radius, shine: false });
  return g;
}

/** 吹き出しのトースト */
export function toast(scene: Phaser.Scene, msg: string, y = 640, _color?: string) {
  const c = scene.add.container(GAME_W / 2, y).setDepth(1000);
  const t = txt(scene, 0, 0, msg, 28, { color: CSS.ink, wrap: 560 });
  const w = Math.min(620, t.width + 48);
  const h = t.height + 28;
  const g = scene.add.graphics();
  drawPlate(g, -w / 2, -h / 2, w, h, PAL.paper, { radius: 22, shadow: 6, shine: false });
  g.fillStyle(PAL.ink, 1);
  g.fillTriangle(-14, h / 2 + 4, 14, h / 2 + 4, 0, h / 2 + 22);
  g.fillStyle(PAL.paper, 1);
  g.fillTriangle(-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 12);
  c.add([g, t]);
  c.setAlpha(0).setScale(0.7);
  scene.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 160, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, y: y - 30, delay: 1500, duration: 260, onComplete: () => c.destroy() });
  return c;
}

/** 数値の浮き上がり表示（+120 など） */
export function floatText(scene: Phaser.Scene, x: number, y: number, s: string, color: string, size = 30) {
  const t = txt(scene, x, y, s, size, { color, stroke: CSS.ink, strokeThickness: 7 }).setDepth(900);
  t.setScale(0.6);
  scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: y - 64, alpha: 0, duration: 900, delay: 150, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

/** ハンコ風にドンと押される文字（UR!!・済・合体！など） */
export function stamp(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: string, opts: { hold?: number; angle?: number; depth?: number } = {}) {
  const t = txt(scene, x, y, s, size, { color, stroke: CSS.ink, strokeThickness: Math.max(6, size / 7), shadow: true });
  t.setDepth(opts.depth ?? 950).setAngle(opts.angle ?? -8).setScale(2.4).setAlpha(0);
  scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 150, ease: 'Back.easeOut' });
  if (opts.hold !== Infinity) {
    scene.tweens.add({ targets: t, alpha: 0, scale: 1.15, delay: 150 + (opts.hold ?? 600), duration: 220, onComplete: () => t.destroy() });
  }
  return t;
}

/** 数値をカウントアップ表示する */
export function countUp(
  scene: Phaser.Scene,
  from: number,
  to: number,
  duration: number,
  onUpdate: (v: number) => void,
  onComplete?: () => void,
) {
  const o = { v: from };
  return scene.tweens.add({
    targets: o,
    v: to,
    duration,
    ease: 'Cubic.easeOut',
    onUpdate: () => onUpdate(Math.round(o.v)),
    onComplete: () => {
      onUpdate(to);
      onComplete?.();
    },
  });
}
