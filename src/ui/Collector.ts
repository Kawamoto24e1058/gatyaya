// 取り立て屋：返済日に暗がりから現れる大きな影。ポップだけど怖い、を担当。
import Phaser from 'phaser';
import { PAL } from '../config';

export class Collector extends Phaser.GameObjects.Container {
  private eyes: Phaser.GameObjects.Graphics;
  private happyEyes: Phaser.GameObjects.Graphics;
  private mouth: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const body = scene.add.graphics();
    // 縁取り（暗い背景でも輪郭が見えるように）
    body.fillStyle(0x5b3a6e, 0.7);
    body.fillEllipse(0, 40, 436, 536);
    for (let i = 0; i < 7; i++) body.fillCircle(-180 + i * 60, 260 + (i % 2) * 30, 64);
    // 影の体（もやっとした裾）
    body.fillStyle(0x0d0710, 1);
    body.fillEllipse(0, 40, 420, 520);
    for (let i = 0; i < 7; i++) body.fillCircle(-180 + i * 60, 260 + (i % 2) * 30, 56);
    body.fillStyle(0x1c1022, 1);
    body.fillEllipse(-30, -20, 300, 360);
    // 山高帽
    body.fillStyle(PAL.ink, 1);
    body.fillRoundedRect(-150, -230, 300, 30, 12);
    body.fillRoundedRect(-95, -380, 190, 160, 18);
    body.fillStyle(PAL.blood, 1);
    body.fillRect(-95, -262, 190, 22);
    // 角（帽子を突き破っている）
    body.fillStyle(0xe9dcc0, 1);
    body.fillTriangle(-120, -300, -96, -250, -70, -296);
    body.fillTriangle(120, -300, 96, -250, 70, -296);
    this.add(body);

    this.eyes = scene.add.graphics();
    this.drawEyes(0xe9dc8a);
    this.happyEyes = scene.add.graphics();
    this.happyEyes.lineStyle(10, 0xe9dc8a, 1);
    for (const ex of [-70, 70]) {
      this.happyEyes.beginPath();
      this.happyEyes.arc(ex, -100, 30, Math.PI * 1.1, Math.PI * 1.9);
      this.happyEyes.strokePath();
    }
    this.happyEyes.setVisible(false);

    this.mouth = scene.add.graphics();
    this.drawMouth(1);
    this.add([this.eyes, this.happyEyes, this.mouth]);
    scene.add.existing(this);
    // ゆらゆら
    scene.tweens.add({ targets: this, angle: { from: -1.5, to: 1.5 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private drawEyes(color: number) {
    const g = this.eyes;
    g.clear();
    for (const ex of [-70, 70]) {
      g.fillStyle(color, 1);
      g.fillEllipse(ex, -100, 76, 56);
      g.fillStyle(0x0d0710, 1);
      g.fillEllipse(ex + (ex < 0 ? 6 : -6), -98, 14, 44);
    }
  }

  private drawMouth(width: number) {
    const g = this.mouth;
    g.clear();
    const w = 150 * width;
    g.fillStyle(0x2a0f18, 1);
    g.beginPath();
    g.moveTo(-w, -10);
    g.lineTo(w, -10);
    g.lineTo(w * 0.6, 40);
    g.lineTo(-w * 0.6, 40);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xf1e6cc, 1);
    const n = Math.round(6 * width);
    for (let i = 0; i < n; i++) {
      const x = -w + 10 + (i * (w * 2 - 20)) / Math.max(1, n - 1);
      g.fillTriangle(x - 12, -10, x + 12, -10, x, 12);
    }
  }

  /** 返済できた：にっこり */
  satisfied() {
    this.eyes.setVisible(false);
    this.happyEyes.setVisible(true);
    this.drawMouth(0.6);
  }

  /** 返済できなかった：目が赤くなり口が裂ける */
  furious() {
    this.drawEyes(0xd94b3d);
    this.drawMouth(1.5);
  }

  blink() {
    if (!this.eyes.visible) return;
    this.scene.tweens.add({ targets: this.eyes, scaleY: 0.1, duration: 70, yoyo: true });
  }
}
