// 朝の瓦版：今朝のニュース（始まったイベント）と噂。タップで閉じる。
import Phaser from 'phaser';
import { CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import type { EventState } from '../game/events';
import { drawPlate, txt } from './widgets';

export function showKawaraban(scene: Phaser.Scene, ev: EventState, day: number, onClose?: () => void) {
  const root = scene.add.container(0, 0).setDepth(2800);
  const shade = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.6).setInteractive();
  root.add(shade);

  const lines = [...ev.news.map((t) => ({ t, news: true })), ...ev.rumors.map((r) => ({ t: r.text, news: false }))];
  const H = 210 + lines.length * 92;
  const paper = scene.add.container(GAME_W / 2, GAME_H / 2 - 40).setAngle(-1.5);
  const g = scene.add.graphics();
  drawPlate(g, -310, -H / 2, 620, H, 0xefe2c4, { radius: 6, shadow: 9, outline: 5, shine: false });
  // 紙のすじ
  g.lineStyle(2, 0x7a4a34, 0.15);
  for (let y = -H / 2 + 100; y < H / 2 - 20; y += 30) g.lineBetween(-290, y, 290, y);
  // 題字
  g.fillStyle(PAL.blood, 1);
  g.fillRect(-310, -H / 2, 620, 70);
  paper.add(g);
  paper.add(txt(scene, -280, -H / 2 + 35, '瓦版', 38, { originX: 0, color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 }));
  paper.add(txt(scene, 280, -H / 2 + 35, `${day}日目の朝`, 22, { originX: 1, color: CSS.cream }));

  lines.forEach((l, i) => {
    const y = -H / 2 + 120 + i * 92;
    const mark = scene.add.graphics();
    if (l.news) {
      drawPlate(mark, -290, y - 20, 70, 40, PAL.vermilion, { radius: 6, shadow: 0, outline: 3, shine: false });
    } else {
      drawPlate(mark, -290, y - 20, 70, 40, PAL.plum, { radius: 6, shadow: 0, outline: 3, shine: false });
    }
    paper.add(mark);
    paper.add(txt(scene, -255, y, l.news ? '速報' : '噂', 20, { color: CSS.cream }));
    paper.add(txt(scene, -200, y, l.t, 24, { originX: 0, color: CSS.ink, wrap: 470, align: 'left' }));
  });
  paper.add(txt(scene, 0, H / 2 - 34, '噂は当たるとは限らない ・ タップで閉じる', 18, { color: CSS.inkSoft, bold: false }));
  root.add(paper);

  paper.setScale(0.3).setAngle(-20);
  scene.tweens.add({ targets: paper, scale: 1, angle: -1.5, duration: 280, ease: 'Back.easeOut' });
  sfx.play('flip', { rate: 0.8 });
  if (ev.news.length > 0) sfx.play('stamp', { delay: 0.2, vol: 0.7 });

  let closed = false;
  shade.on('pointerdown', () => {
    if (closed) return;
    closed = true;
    sfx.play('whoosh');
    scene.tweens.add({ targets: root, alpha: 0, duration: 180, onComplete: () => root.destroy() });
    onClose?.();
  });
  return root;
}
