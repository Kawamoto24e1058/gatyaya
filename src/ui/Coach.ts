// 初回の説明役：ガチャ機（付喪神）が吹き出しでしゃべる。指さし矢印つき。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { sfx } from '../core/audio';
import { drawPlate, txt } from './widgets';

export type Point = { x: number; y: number };

export class Coach {
  private bubble?: Phaser.GameObjects.Container;
  private arrow?: Phaser.GameObjects.Container;
  private follow?: () => Point | null;

  constructor(private scene: Phaser.Scene) {}

  /** 吹き出しを出す（前のものは消す）。target を渡すとそこを指す矢印も出す */
  say(at: Point, text: string, target?: () => Point | null) {
    this.clear();
    const s = this.scene;
    const c = s.add.container(at.x, at.y).setDepth(1500);
    const t = txt(s, 0, 0, text, 25, { color: CSS.ink, wrap: 500 });
    const w = Math.min(560, t.width + 50);
    const h = t.height + 30;
    const g = s.add.graphics();
    drawPlate(g, -w / 2, -h / 2, w, h, PAL.paper, { radius: 22, shadow: 6, outline: 5, shine: false });
    g.fillStyle(PAL.ink, 1);
    g.fillTriangle(-16, h / 2 + 3, 16, h / 2 + 3, 0, h / 2 + 26);
    g.fillStyle(PAL.paper, 1);
    g.fillTriangle(-9, h / 2 - 2, 9, h / 2 - 2, 0, h / 2 + 15);
    c.add([g, t]);
    c.setScale(0.6).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
    sfx.play('pop', { rate: 1.4, vol: 0.5 });
    this.bubble = c;

    if (target) {
      this.follow = target;
      const a = s.add.container(0, 0).setDepth(1500);
      const ag = s.add.graphics();
      ag.fillStyle(PAL.ink, 1);
      ag.fillTriangle(-24, -52, 24, -52, 0, -6);
      ag.fillRect(-11, -84, 22, 36);
      ag.fillStyle(PAL.mustard, 1);
      ag.fillTriangle(-16, -48, 16, -48, 0, -14);
      ag.fillRect(-6, -78, 12, 32);
      a.add(ag);
      s.tweens.add({ targets: ag, y: -14, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.arrow = a;
      this.update();
    }
  }

  /** 矢印を対象に追従させる（毎フレーム呼ぶ） */
  update() {
    if (!this.arrow || !this.follow) return;
    const p = this.follow();
    if (!p) {
      this.arrow.setVisible(false);
      return;
    }
    this.arrow.setVisible(true).setPosition(p.x, p.y);
  }

  clear() {
    this.bubble?.destroy();
    this.arrow?.destroy();
    this.bubble = this.arrow = undefined;
    this.follow = undefined;
  }
}
