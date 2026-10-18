// バイト（ミニゲーム）共通の小物
import Phaser from 'phaser';
import { CSS, GAME_H } from '../config';
import { txt } from '../ui/widgets';

/** 縦長端末では遊ぶ場所を画面中央へ寄せる（1280 基準の座標に足す） */
export const OY = Math.round((GAME_H - 1280) / 2);

/** 判定の文字（PERFECT / ミス など）を一瞬出す */
export function popText(scene: Phaser.Scene, x: number, y: number, s: string, color: string = CSS.cream, size = 32) {
  const t = txt(scene, x, y, s, size, { color, stroke: CSS.ink, strokeThickness: 7 }).setDepth(500);
  t.setScale(0.6);
  scene.tweens.add({ targets: t, scale: 1, duration: 100, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 520, delay: 120, onComplete: () => t.destroy() });
}

export function makeSparks(scene: Phaser.Scene) {
  return scene.add
    .particles(0, 0, 'spark', {
      emitting: false,
      speed: { min: 100, max: 320 },
      scale: { start: 0.8, end: 0 },
      lifespan: 420,
      gravityY: 600,
    })
    .setDepth(400);
}

/** 連鎖の表示 */
export function comboLabel(scene: Phaser.Scene, y: number) {
  return txt(scene, 360, y, '', 46, { color: CSS.gold, stroke: CSS.ink, strokeThickness: 9, shadow: true }).setDepth(450);
}
