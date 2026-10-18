// 景品をトレカとして表示する。開封演出と売却画面で共用。
import Phaser from 'phaser';
import { CSS } from '../config';
import { SERIES_BY_ID, type Prize } from '../data/prizes';
import { RARITY_INFO } from '../data/rarity';
import { artKey, cardKey, CARD_H, CARD_W } from './textures';
import { txt } from './widgets';

export { CARD_H, CARD_W };

/** 中心 (0,0)・240×336 のカード */
export function makePrizeCard(scene: Phaser.Scene, p: Prize, opts: { count?: number } = {}): Phaser.GameObjects.Container {
  const se = SERIES_BY_ID[p.seriesId];
  const info = RARITY_INFO[p.rarity];
  const c = scene.add.container(0, 0);
  const ox = -CARD_W / 2;
  const oy = -CARD_H / 2;
  c.add(scene.add.image(0, 0, cardKey(p.rarity, p.seriesId)));
  c.add(scene.add.image(0, oy + 130, artKey(p.id)).setScale(1.02));
  c.add(txt(scene, ox + 20, oy + 24, se.name, 19, { originX: 0, color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }));
  c.add(txt(scene, ox + CARD_W - 18, oy + 24, p.rarity, 24, { originX: 1, color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 }));
  c.add(
    txt(scene, 0, oy + 257, p.name, p.name.length > 8 ? 20 : p.name.length > 6 ? 24 : 28, {
      color: CSS.ink,
      wrap: CARD_W - 52,
    }),
  );
  if (opts.count !== undefined) {
    const b = scene.add.graphics();
    b.fillStyle(0x24172e, 1);
    b.fillCircle(CARD_W / 2 - 12, CARD_H / 2 - 12, 36);
    b.fillStyle(0xd94b3d, 1);
    b.fillCircle(CARD_W / 2 - 12, CARD_H / 2 - 12, 30);
    c.add(b);
    c.add(txt(scene, CARD_W / 2 - 12, CARD_H / 2 - 12, `×${opts.count}`, 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }));
  }
  c.setData('rarityIndex', info.index);
  return c;
}

/**
 * SR 以上のカードに、斜めのきらめき（ホロの反射）を 1 往復走らせる。
 * マスクを使うので同時に 1 枚だけに使う想定（開封演出・詳細パネル）。
 */
export function shine(scene: Phaser.Scene, card: Phaser.GameObjects.Container, repeat = 0) {
  const band = scene.add.rectangle(-CARD_W, 0, 46, CARD_H * 1.6, 0xffffff, 0.45).setAngle(20);
  const band2 = scene.add.rectangle(-CARD_W + 40, 0, 14, CARD_H * 1.6, 0xffffff, 0.35).setAngle(20);
  card.add([band, band2]);
  const m = scene.make.graphics({}, false);
  const update = () => {
    m.clear();
    m.fillStyle(0xffffff);
    const w = CARD_W * card.scaleX;
    const h = CARD_H * card.scaleY;
    m.fillRoundedRect(card.x - Math.abs(w) / 2, card.y - h / 2, Math.abs(w), h, 16 * card.scaleY);
  };
  update();
  const mask = m.createGeometryMask();
  band.setMask(mask);
  band2.setMask(mask);
  scene.tweens.add({
    targets: [band, band2],
    x: `+=${CARD_W * 2}`,
    duration: 650,
    repeat,
    repeatDelay: 900,
    ease: 'Sine.easeInOut',
    onUpdate: update,
  });
  card.once(Phaser.GameObjects.Events.DESTROY, () => m.destroy());
}
