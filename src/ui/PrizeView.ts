// 景品（グッズ）＋名札の表示。開封演出と売却画面で共用。
import Phaser from 'phaser';
import { CSS, PAL } from '../config';
import { KIND_LABEL, SERIES_BY_ID, type Prize } from '../data/prizes';
import { RARITIES, RARITY_INFO } from '../data/rarity';
import { itemKey, shinyItemKey } from './textures';
import { drawPlate, txt } from './widgets';

/** グッズ本体の中心は (0, ITEM_Y)、名札の中心は (0, TAG_Y) */
export const ITEM_Y = -46;
export const TAG_Y = 112;
export const VIEW_W = 232;
export const VIEW_H = 300;

export function makeTag(scene: Phaser.Scene, p: Prize, shiny = false): Phaser.GameObjects.Container {
  const se = SERIES_BY_ID[p.seriesId];
  const info = RARITY_INFO[p.rarity];
  const c = scene.add.container(0, TAG_Y);
  const g = scene.add.graphics();
  drawPlate(g, -110, -36, 220, 72, PAL.paper, { radius: 10, shadow: 5, outline: 4, shine: false });
  g.fillStyle(Phaser.Display.Color.HexStringToColor(se.color).color, 1);
  g.fillRoundedRect(-110, -36, 16, 72, { tl: 10, bl: 10, tr: 0, br: 0 });
  // レア度の札
  drawPlate(g, 50, -52, 62, 30, info.color, { radius: 8, shadow: 0, outline: 3, shine: false });
  c.add(g);
  c.add(txt(scene, 81, -37, p.rarity, 20, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 4 }));
  if (shiny) {
    const sg = scene.add.graphics();
    drawPlate(sg, -112, -52, 92, 30, PAL.mustard, { radius: 8, shadow: 0, outline: 3, shine: false });
    c.add(sg);
    c.add(txt(scene, -66, -37, '✦色違い', 17, { color: CSS.ink }));
  }
  c.add(txt(scene, -86, -16, `${KIND_LABEL[p.kind]}・${se.name}`, 15, { originX: 0, color: CSS.inkSoft }));
  c.add(txt(scene, 6, 14, p.name, p.name.length > 9 ? 19 : p.name.length > 7 ? 22 : 25, { color: CSS.ink, wrap: 196 }));
  return c;
}

export function makePrizeView(scene: Phaser.Scene, p: Prize, opts: { count?: number; shiny?: boolean } = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const item = scene.add.image(0, ITEM_Y, opts.shiny ? shinyItemKey(scene, p.id) : itemKey(p.id)).setName('item');
  c.add(item);
  c.add(makeTag(scene, p, opts.shiny).setName('tag'));
  if (opts.count !== undefined) {
    const b = scene.add.graphics();
    b.fillStyle(PAL.ink, 1);
    b.fillCircle(92, ITEM_Y - 92, 32);
    b.fillStyle(PAL.vermilion, 1);
    b.fillCircle(92, ITEM_Y - 92, 26);
    c.add(b);
    c.add(txt(scene, 92, ITEM_Y - 92, `×${opts.count}`, 25, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }));
  }
  return c;
}

/** SR 以上のグッズのまわりで星がきらめく */
export function twinkle(scene: Phaser.Scene, view: Phaser.GameObjects.Container, rarityIndex: number) {
  if (rarityIndex < 2) return;
  const n = 2 + rarityIndex * 2;
  for (let i = 0; i < n; i++) {
    const s = scene.add
      .image(Phaser.Math.Between(-100, 100), ITEM_Y + Phaser.Math.Between(-100, 90), 'spark')
      .setScale(0)
      .setTint(i % 2 ? 0xfff2c0 : RARITY_INFO[RARITIES[rarityIndex]].color);
    view.add(s);
    scene.tweens.add({
      targets: s,
      scale: { from: 0, to: Phaser.Math.FloatBetween(0.7, 1.2) },
      angle: 90,
      duration: 380,
      yoyo: true,
      repeat: -1,
      delay: i * 160,
      repeatDelay: Phaser.Math.Between(200, 900),
    });
  }
}
