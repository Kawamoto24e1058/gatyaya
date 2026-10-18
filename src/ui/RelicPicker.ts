// 縁起物を 3 つから 1 つ選ぶ画面（黒いカプセル・返済後の取り立て屋で共用）
import Phaser from 'phaser';
import { CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import type { Relic } from '../game/relics';
import { omamoriKey } from './textures';
import { Button, drawPlate, title, txt } from './widgets';

const RARITY_LABEL: Record<Relic['rarity'], string> = { common: '並', rare: '上', boss: '訳あり' };

export function showRelicPicker(
  scene: Phaser.Scene,
  opts: { heading: string; sub?: string; relics: Relic[]; onDone: (r: Relic | null) => void },
) {
  const root = scene.add.container(0, 0).setDepth(3000);
  root.add(scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.82).setInteractive());
  const top = GAME_H / 2 - 330;
  root.add(title(scene, 360, top - 70, opts.heading, 40, CSS.gold));
  if (opts.sub) root.add(txt(scene, 360, top - 20, opts.sub, 22, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 4 }));

  let selected: Relic | null = null;
  const plates: Phaser.GameObjects.Container[] = [];
  const confirm = new Button(scene, 360, top + 3 * 170 + 70, {
    w: 360,
    h: 96,
    color: PAL.moss,
    label: 'これにする',
    size: 32,
    onPress: () => close(selected),
    onDenied: () => undefined,
  }).setEnabled(false);
  const skip = new Button(scene, 360, top + 3 * 170 + 180, { w: 260, h: 70, color: PAL.plum, label: 'いらない', size: 24, onPress: () => close(null) });

  opts.relics.forEach((r, i) => {
    const y = top + 80 + i * 170;
    const c = scene.add.container(360, y);
    const g = scene.add.graphics();
    drawPlate(g, -300, -72, 600, 144, r.rarity === 'boss' ? 0xf2dcd2 : PAL.paper, { radius: 16, shadow: 6, outline: 5, shine: false });
    c.add(g);
    c.add(scene.add.image(-236, 0, omamoriKey(r.id)));
    c.add(txt(scene, -180, -40, r.name, 30, { originX: 0, color: CSS.ink }));
    c.add(txt(scene, 270, -40, RARITY_LABEL[r.rarity], 20, { originX: 1, color: r.rarity === 'boss' ? CSS.bad : CSS.inkSoft }));
    c.add(txt(scene, -180, r.drawback ? -2 : 12, r.description, 21, { originX: 0, color: CSS.ink, bold: false, wrap: 440, align: 'left' }));
    if (r.drawback) c.add(txt(scene, -180, 36, `ただし：${r.drawback}`, 20, { originX: 0, color: CSS.bad, wrap: 440, align: 'left' }));
    c.setSize(600, 144).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      selected = r;
      sfx.play('tap');
      plates.forEach((p, j) => {
        p.setScale(j === i ? 1.04 : 0.96).setAlpha(j === i ? 1 : 0.6);
      });
      confirm.setEnabled(true);
    });
    c.setScale(0.6).setAlpha(0);
    scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, delay: 120 + i * 110, ease: 'Back.easeOut' });
    scene.time.delayedCall(120 + i * 110, () => sfx.play('flip', { rate: 1 + i * 0.1, vol: 0.6 }));
    plates.push(c);
    root.add(c);
  });
  root.add([confirm, skip]);

  const close = (r: Relic | null) => {
    if (r) {
      sfx.play('sparkle');
      sfx.play('stamp', { vol: 0.6 });
    }
    scene.tweens.add({ targets: root, alpha: 0, duration: 180, onComplete: () => root.destroy() });
    opts.onDone(r);
  };
  return root;
}
