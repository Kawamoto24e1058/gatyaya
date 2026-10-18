import Phaser from 'phaser';
import { CSS, FONT } from '../config';
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
    padding: { top: 4, bottom: 4 },
  });
  t.setOrigin(o.originX ?? 0.5, o.originY ?? 0.5);
  return t;
}

export type ButtonOpts = {
  w: number;
  h: number;
  color: number;
  label: string;
  sub?: string;
  size?: number;
  textColor?: string;
  onPress: () => void;
  /** 押せないときに呼ばれる（理由のトーストなど） */
  onDenied?: () => void;
};

/** pointerdown で即反応するボタン */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private subText?: Phaser.GameObjects.Text;
  private _enabled = true;
  private pulseTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private o: ButtonOpts,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.drawBg();
    const size = o.size ?? 34;
    this.label = txt(scene, 0, o.sub ? -14 : 0, o.label, size, { color: o.textColor ?? CSS.white });
    this.add([this.bg, this.label]);
    if (o.sub) {
      this.subText = txt(scene, 0, 24, o.sub, 22, { color: o.textColor ?? CSS.white, bold: false });
      this.subText.setAlpha(0.85);
      this.add(this.subText);
    }
    this.setSize(o.w, o.h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (!this._enabled) {
        sfx.play('buzz', { vol: 0.5 });
        this.scene.tweens.add({ targets: this, x: this.x + 6, duration: 40, yoyo: true, repeat: 2 });
        o.onDenied?.();
        return;
      }
      sfx.play('tap');
      this.scene.tweens.add({ targets: this, scale: 0.93, duration: 50, yoyo: true, ease: 'Quad.easeOut' });
      o.onPress();
    });
    scene.add.existing(this);
  }

  private drawBg() {
    const { w, h, color } = this.o;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 22);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w - 12, h * 0.38, 16);
  }

  setLabel(label: string, sub?: string) {
    this.label.setText(label);
    if (sub !== undefined) this.subText?.setText(sub);
    return this;
  }

  setEnabled(e: boolean) {
    this._enabled = e;
    this.setAlpha(e ? 1 : 0.45);
    return this;
  }

  get enabled() {
    return this._enabled;
  }

  setPulse(on: boolean) {
    if (on && !this.pulseTween) {
      this.pulseTween = this.scene.tweens.add({
        targets: this,
        scale: 1.07,
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

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color = 0xfff6e6, radius = 24) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(x - w / 2, y - h / 2 + 8, w, h, radius);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  return g;
}

/** 画面中央付近に短いメッセージ */
export function toast(scene: Phaser.Scene, msg: string, y = 640, color = '#ffffff') {
  const t = txt(scene, 360, y, msg, 30, { color, stroke: '#1b1430', strokeThickness: 8, wrap: 640 });
  t.setDepth(1000).setAlpha(0).setScale(0.8);
  scene.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 120, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, alpha: 0, y: y - 40, delay: 1300, duration: 300, onComplete: () => t.destroy() });
  return t;
}

/** 数値の浮き上がり表示（+120 など） */
export function floatText(scene: Phaser.Scene, x: number, y: number, s: string, color: string, size = 30) {
  const t = txt(scene, x, y, s, size, { color, stroke: '#1b1430', strokeThickness: 6 }).setDepth(900);
  scene.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
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
