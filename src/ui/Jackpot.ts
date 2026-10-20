// 大当たりの演出：画面が光り、金の後光が回り、コインが降って金額が数え上がる。
// 高額が出た瞬間の気持ちよさを担う（売り場の大儲け・太客、バイトの大当たりで共用）。
import Phaser from 'phaser';
import { CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { fmt, vibrate } from '../core/util';
import { countUp, title, txt } from './widgets';

export function jackpotFx(scene: Phaser.Scene, opts: { heading: string; amount?: number; sub?: string; y?: number; big?: boolean }) {
  const cy = opts.y ?? GAME_H / 2 - 80;
  const big = opts.big ?? true;
  const root = scene.add.container(0, 0).setDepth(4000);

  // 白く光る
  const flash = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xffffff, 0.85);
  root.add(flash);
  scene.tweens.add({ targets: flash, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
  const dim = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0).setAlpha(0);
  root.add(dim);
  scene.tweens.add({ targets: dim, fillAlpha: 0.45, alpha: 1, duration: 300 });

  // 金の後光（回る放射線）
  const rays = scene.add.graphics({ x: GAME_W / 2, y: cy });
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    rays.fillStyle(i % 2 ? PAL.mustard : 0xfff1b8, i % 2 ? 0.22 : 0.12);
    rays.slice(0, 0, 900, a, a + Math.PI / n, false);
    rays.fillPath();
  }
  rays.setScale(0.2);
  root.add(rays);
  scene.tweens.add({ targets: rays, scale: 1, duration: 500, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });

  // 見出しと金額
  const head = title(scene, GAME_W / 2, cy - 90, opts.heading, big ? 64 : 52, CSS.gold).setScale(0.2);
  root.add(head);
  scene.tweens.add({ targets: head, scale: 1, duration: 420, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: head, angle: { from: -3, to: 3 }, duration: 260, yoyo: true, repeat: 5 });
  if (opts.amount !== undefined) {
    const amt = txt(scene, GAME_W / 2, cy + 10, '+0', big ? 92 : 72, { color: CSS.gold, stroke: CSS.ink, strokeThickness: 12, shadow: true });
    root.add(amt);
    countUp(scene, 0, opts.amount, big ? 1100 : 700, (v) => amt.setText(`+${fmt(v)}`));
    scene.tweens.add({ targets: amt, scale: { from: 1.25, to: 1 }, duration: 260, delay: big ? 1100 : 700, ease: 'Back.easeOut' });
  }
  if (opts.sub) root.add(txt(scene, GAME_W / 2, cy + 100, opts.sub, 26, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 }));

  // コインの雨
  const coins = big ? 46 : 22;
  for (let i = 0; i < coins; i++) {
    const c = scene.add.image(Phaser.Math.Between(20, GAME_W - 20), -60 - Math.random() * 400, 'coin').setScale(0.8 + Math.random() * 0.7);
    root.add(c);
    scene.tweens.add({
      targets: c,
      y: GAME_H + 80,
      angle: Phaser.Math.Between(-400, 400),
      duration: Phaser.Math.Between(1100, 1900),
      delay: Phaser.Math.Between(0, 700),
      ease: 'Quad.easeIn',
    });
  }

  // 音と振動：ファンファーレ＋チャリンの連打
  sfx.play('fanfare');
  for (let i = 0; i < (big ? 10 : 5); i++) sfx.play('coin', { delay: 0.15 + i * 0.09, rate: 1 + i * 0.04, vol: 0.6 });
  vibrate(big ? [40, 60, 40, 60, 120] : [30, 50, 60]);
  scene.cameras.main.shake(big ? 450 : 250, big ? 0.012 : 0.007);

  // 自動で消える（タップでも早送り）
  const close = () => {
    if (!root.active) return;
    scene.tweens.add({ targets: root, alpha: 0, duration: 260, onComplete: () => root.destroy() });
  };
  scene.time.delayedCall(big ? 2600 : 1800, close);
  flash.setInteractive().on('pointerdown', close);
  return root;
}
