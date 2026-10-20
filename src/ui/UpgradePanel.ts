// 夜の改装：閉店後にコインで店（改装）とガチャ機（機材）を強化する画面
import Phaser from 'phaser';
import { CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { daysUntilPayday, dueAmount, S, saveNow } from '../game/state';
import { buyUpgrade, nextUpgradeCost, upgradeLevel, UPGRADES, type UpgradeDef } from '../game/upgrades';
import { Button, drawPlate, stamp, title, txt } from './widgets';

export function showUpgradePanel(scene: Phaser.Scene, onClose: () => void) {
  const s = S();
  const root = scene.add.container(0, 0).setDepth(3000);
  root.add(scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.9).setInteractive());
  const rowH = 128;
  const maxRows = Math.max(...(['shop', 'machine'] as const).map((c) => UPGRADES.filter((u) => u.cat === c).length));
  const top = GAME_H / 2 - (maxRows * rowH) / 2 + 10;
  let tab: UpgradeDef['cat'] = 'shop';
  root.add(title(scene, 360, top - 170, '夜の改装', 48, CSS.gold));
  const coinT = txt(scene, 360, top - 118, '', 24, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 });
  root.add(coinT);
  const rows = scene.add.container(0, 0);
  root.add(rows);

  // タブ：店の改装 ／ ガチャ機の機材
  const tabs = (['shop', 'machine'] as const).map((c, i) => {
    const b = new Button(scene, 250 + i * 220, top - 50, {
      w: 200,
      h: 64,
      color: PAL.wood,
      label: c === 'shop' ? '店の改装' : 'ガチャ機材',
      size: 24,
      onPress: () => {
        tab = c;
        render();
      },
    });
    root.add(b);
    return { c, b };
  });

  const render = () => {
    rows.removeAll(true);
    for (const t of tabs) t.b.setAlpha(t.c === tab ? 1 : 0.55).setScale(t.c === tab ? 1.04 : 0.96);
    const days = daysUntilPayday(s);
    coinT.setText(`所持 ${fmt(s.coins)} コイン　／　返済 ${fmt(dueAmount(s))}（${days === 0 ? '明日' : `あと ${days} 日`}）`);
    UPGRADES.filter((u) => u.cat === tab).forEach((u, i) => {
      const y = top + i * rowH + rowH / 2;
      const lv = upgradeLevel(s, u.id);
      const max = u.levels.length;
      const cost = nextUpgradeCost(s, u.id);
      const g = scene.add.graphics();
      drawPlate(g, 30, y - rowH / 2 + 6, 660, rowH - 12, PAL.paper, { radius: 14, shadow: 5, outline: 4, shine: false });
      g.fillStyle(PAL.woodDark, 1);
      g.fillRoundedRect(46, y - 38, 76, 76, 12);
      rows.add(g);
      rows.add(txt(scene, 84, y, u.glyph, 40, { color: CSS.gold }));
      rows.add(txt(scene, 140, y - 32, u.name, 26, { originX: 0, color: CSS.ink }));
      // レベルの目盛り
      const pips = scene.add.graphics();
      for (let k = 0; k < max; k++) {
        pips.fillStyle(k < lv ? PAL.vermilion : PAL.paperShade, 1);
        pips.fillCircle(140 + 10 + u.name.length * 26 + 14 + k * 22, y - 32, 8);
      }
      rows.add(pips);
      const next = cost === null ? '最大まで改装済み' : `次：${u.levels[lv].text}`;
      rows.add(txt(scene, 140, y + 14, next, 19, { originX: 0, color: cost === null ? CSS.inkSoft : CSS.ink, bold: false, wrap: 360, align: 'left' }));
      if (cost !== null) {
        const b = new Button(scene, 596, y, {
          w: 150,
          h: 84,
          color: PAL.moss,
          label: '改装',
          sub: `${fmt(cost)}`,
          size: 26,
          onPress: () => {
            if (!buyUpgrade(s, u.id)) return;
            saveNow();
            sfx.play('knock', { rate: 0.8 });
            sfx.play('coin', { delay: 0.1 });
            stamp(scene, 360, y, `${u.name}！`, 36, CSS.gold, { hold: 400, depth: 3100 });
            render();
          },
          onDenied: () => undefined,
        });
        b.setEnabled(s.coins >= cost);
        rows.add(b);
      }
    });
  };
  render();

  const close = new Button(scene, 360, top + maxRows * rowH + 60, { w: 300, h: 88, color: PAL.plum, label: '閉じる', size: 30, onPress: () => {
    sfx.play('whoosh');
    root.destroy();
    onClose();
  } });
  root.add(close);
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 180 });
  return root;
}
