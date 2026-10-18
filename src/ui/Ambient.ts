// 背景の“気配”：漂う人魂・舞うほこり・暗がりの目。うるさくならないよう控えめに。
import Phaser from 'phaser';

type Rect = { x: number; y: number; w: number; h: number };

/** ふわふわ漂う人魂 */
export function addWisps(scene: Phaser.Scene, area: Rect, count: number, depth = 5) {
  for (let i = 0; i < count; i++) {
    const w = scene.add
      .image(area.x + Math.random() * area.w, area.y + Math.random() * area.h, 'wisp')
      .setDepth(depth)
      .setAlpha(0)
      .setScale(Phaser.Math.FloatBetween(0.45, 0.7));
    const drift = () => {
      scene.tweens.add({
        targets: w,
        x: area.x + Math.random() * area.w,
        y: area.y + Math.random() * area.h,
        duration: Phaser.Math.Between(5000, 9000),
        ease: 'Sine.easeInOut',
        onComplete: drift,
      });
    };
    drift();
    scene.tweens.add({ targets: w, alpha: { from: 0, to: 0.45 }, duration: 2400, yoyo: true, repeat: -1, delay: i * 1700, hold: 2000 });
    scene.tweens.add({ targets: w, scaleX: w.scaleX * 0.85, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}

/** 灯りの中を舞うほこり */
export function addDust(scene: Phaser.Scene, area: Rect, depth = 6) {
  return scene.add
    .particles(0, 0, 'dot', {
      x: { min: area.x, max: area.x + area.w },
      y: { min: area.y, max: area.y + area.h },
      lifespan: 6000,
      speedY: { min: -12, max: -4 },
      speedX: { min: -6, max: 6 },
      scale: { min: 0.15, max: 0.35 },
      alpha: { onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.35 },
      tint: 0xf6d9a0,
      frequency: 400,
    })
    .setDepth(depth);
}

/** 暗がりからのぞく目（ときどき現れてまばたきする） */
export function addPeekingEyes(scene: Phaser.Scene, x: number, y: number, depth = 4) {
  const eyes = scene.add.image(x, y, 'eyes').setDepth(depth).setAlpha(0);
  const loop = () => {
    scene.time.delayedCall(Phaser.Math.Between(3000, 8000), () => {
      eyes.setX(x + Phaser.Math.Between(-40, 40));
      scene.tweens.chain({
        targets: eyes,
        tweens: [
          { alpha: 1, duration: 400 },
          { scaleY: 0.1, duration: 70, yoyo: true, delay: 700 },
          { scaleY: 0.1, duration: 70, yoyo: true, delay: 500 },
          { alpha: 0, duration: 300, delay: 600 },
        ],
        onComplete: loop,
      });
    });
  };
  loop();
  return eyes;
}

/** 揺れる提灯 */
export function addLantern(scene: Phaser.Scene, x: number, y: number, scale = 0.85, depth = 8) {
  const l = scene.add.image(x, y, 'lantern').setOrigin(0.5, 0).setScale(scale).setDepth(depth).setAngle(-4);
  scene.tweens.add({ targets: l, angle: 4, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return l;
}
