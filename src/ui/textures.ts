// 外部画像は使わず、起動時に Canvas でテクスチャを生成する。
import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { PRIZE_BY_ID, PRIZES } from '../data/prizes';
import { RELICS, type Relic } from '../game/relics';
import { RARITIES, RARITY_INFO, type Rarity } from '../data/rarity';
import { INK, inkStroke, paintDuskBg, rr } from './art';
import { drawItem, ITEM_H, ITEM_W } from './items';

export const capsuleKey = (r: Rarity) => `cap_${r}`;
export const itemKey = (prizeId: string) => `item_${prizeId}`;
export const omamoriKey = (relicId: string) => `omamori_${relicId}`;

const OMAMORI_COLOR: Record<Relic['rarity'], [string, string]> = {
  common: ['#5a9a6e', '#3f7350'],
  rare: ['#5b8fc9', '#3d6b9e'],
  boss: ['#b0303a', '#7e1f28'],
};

/** 縁起物のお守り袋（80×110） */
function drawOmamori(c: CanvasRenderingContext2D, r: Relic) {
  const [col, dark] = OMAMORI_COLOR[r.rarity];
  // 紐
  c.strokeStyle = '#e8b13a';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(40, 4);
  c.quadraticCurveTo(28, 14, 34, 24);
  c.moveTo(40, 4);
  c.quadraticCurveTo(52, 14, 46, 24);
  c.stroke();
  // 袋
  c.beginPath();
  c.moveTo(18, 30);
  c.quadraticCurveTo(40, 18, 62, 30);
  c.lineTo(70, 100);
  c.quadraticCurveTo(40, 108, 10, 100);
  c.closePath();
  const g = c.createLinearGradient(0, 20, 0, 106);
  g.addColorStop(0, col);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.fill();
  inkStroke(c, 4);
  // 刺繍の縁
  c.setLineDash([4, 4]);
  c.strokeStyle = 'rgba(232,177,58,0.8)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(22, 36);
  c.quadraticCurveTo(40, 26, 58, 36);
  c.lineTo(64, 94);
  c.quadraticCurveTo(40, 100, 16, 94);
  c.closePath();
  c.stroke();
  c.setLineDash([]);
  // 札と 1 文字
  rr(c, 24, 42, 32, 44, 4);
  c.fillStyle = '#f6ead2';
  c.fill();
  inkStroke(c, 2.5);
  c.font = '900 26px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = r.rarity === 'boss' ? '#b0303a' : '#24172e';
  c.fillText(r.glyph, 40, 65);
}

/** 色相を回す（CSS の hue-rotate と同じ行列）。輪郭の墨色はほぼそのまま残る */
function hueRotate(img: ImageData, deg: number, sat = 1.25) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    let nr = m[0] * r + m[1] * g + m[2] * b;
    let ng = m[3] * r + m[4] * g + m[5] * b;
    let nb = m[6] * r + m[7] * g + m[8] * b;
    const l = (nr + ng + nb) / 3;
    nr = l + (nr - l) * sat;
    ng = l + (ng - l) * sat;
    nb = l + (nb - l) * sat;
    d[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
    d[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
    d[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
  }
}

/** 色違いグッズのテクスチャ（必要になったときに作る） */
export function shinyItemKey(scene: Phaser.Scene, prizeId: string): string {
  const key = `item_${prizeId}_s`;
  canvasTex(scene, key, ITEM_W, ITEM_H, (c) => {
    drawItem(c, PRIZE_BY_ID[prizeId]);
    const img = c.getImageData(0, 0, ITEM_W, ITEM_H);
    hueRotate(img, 150);
    c.putImageData(img, 0, 0);
    // 金のきらめき
    for (const [x, y, r] of [
      [26, 30, 12],
      [ITEM_W - 24, 46, 9],
      [30, ITEM_H - 40, 8],
      [ITEM_W - 30, ITEM_H - 30, 13],
    ]) {
      c.beginPath();
      c.moveTo(x, y - r);
      c.quadraticCurveTo(x + r * 0.15, y - r * 0.15, x + r, y);
      c.quadraticCurveTo(x + r * 0.15, y + r * 0.15, x, y + r);
      c.quadraticCurveTo(x - r * 0.15, y + r * 0.15, x - r, y);
      c.quadraticCurveTo(x - r * 0.15, y - r * 0.15, x, y - r);
      c.fillStyle = '#f2c94c';
      c.fill();
      inkStroke(c, 2.5);
    }
  });
  return key;
}

type C = CanvasRenderingContext2D;

export function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: C) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

/** UR 用のホロ（虹）グラデーション。ネオンにならないよう彩度を抑える */
export function holoGradient(c: C, x0: number, y0: number, x1: number, y1: number) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  ['#e7798f', '#ebb75a', '#ece08a', '#84c79a', '#79b3c9', '#a78bd0'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
  return g;
}

function drawCapsule(c: C, cx: number, cy: number, r: number, rarity: Rarity) {
  const info = RARITY_INFO[rarity];
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.clip();
  // 下半分：生成り色
  c.fillStyle = '#f3e9d6';
  c.fillRect(cx - r, cy, r * 2, r);
  // 上半分：レア度色
  if (rarity === 'UR') c.fillStyle = holoGradient(c, cx - r, cy - r, cx + r, cy);
  else if (rarity === 'SSR') {
    const g = c.createLinearGradient(cx, cy - r, cx, cy);
    g.addColorStop(0, '#f6dd8a');
    g.addColorStop(1, '#d08f2a');
    c.fillStyle = g;
  } else c.fillStyle = info.css;
  c.fillRect(cx - r, cy - r, r * 2, r);
  // ベタ影（右下）
  c.fillStyle = 'rgba(36,23,46,0.18)';
  c.beginPath();
  c.arc(cx + r * 0.35, cy + r * 0.3, r, 0, Math.PI * 2);
  c.arc(cx, cy, r, 0, Math.PI * 2, true);
  c.fill();
  c.restore();
  // 合わせ目
  c.beginPath();
  c.moveTo(cx - r + 2, cy);
  c.lineTo(cx + r - 2, cy);
  inkStroke(c, 3.5);
  // 外周
  c.beginPath();
  c.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
  inkStroke(c, 5);
  // ハイライト
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.beginPath();
  c.ellipse(cx - r * 0.4, cy - r * 0.48, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2);
  c.fill();
  // SSR 以上：合わせ目のすき間から目がのぞく
  if (info.index >= 3) {
    for (const s of [-1, 1]) {
      c.fillStyle = INK;
      c.beginPath();
      c.ellipse(cx + s * r * 0.28, cy + 1, r * 0.11, r * 0.07, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff4c0';
      c.beginPath();
      c.arc(cx + s * r * 0.28, cy + 1, r * 0.04, 0, Math.PI * 2);
      c.fill();
    }
  }
  // レア度の刻印
  if (info.index >= 1) {
    c.font = `900 ${Math.round(r * 0.4)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 4;
    c.strokeStyle = INK;
    c.strokeText(rarity, cx, cy + r * 0.5);
    c.fillStyle = '#f3e9d6';
    c.fillText(rarity, cx, cy + r * 0.5);
  }
}

function icon(scene: Phaser.Scene, key: string, draw: (c: C) => void) {
  canvasTex(scene, key, 72, 72, (c) => {
    c.translate(36, 36);
    draw(c);
  });
}

export function makeTextures(scene: Phaser.Scene): void {
  for (const r of RARITIES) {
    const rad = RARITY_INFO[r].radius;
    const size = rad * 2 + 4;
    canvasTex(scene, capsuleKey(r), size, size, (c) => drawCapsule(c, size / 2, size / 2, rad, r));
  }

  for (const p of PRIZES) canvasTex(scene, itemKey(p.id), ITEM_W, ITEM_H, (c) => drawItem(c, p));
  for (const r of RELICS) canvasTex(scene, omamoriKey(r.id), 80, 110, (c) => drawOmamori(c, r));

  // 黒いカプセル（縁起物入り）。お札で封じてある
  canvasTex(scene, 'cap_black', 92, 92, (c) => {
    c.beginPath();
    c.arc(46, 46, 42, 0, Math.PI * 2);
    const g = c.createLinearGradient(0, 4, 0, 88);
    g.addColorStop(0, '#3b2a44');
    g.addColorStop(1, '#0d0710');
    c.fillStyle = g;
    c.fill();
    inkStroke(c, 5);
    c.beginPath();
    c.moveTo(6, 46);
    c.lineTo(86, 46);
    inkStroke(c, 3);
    c.save();
    c.translate(46, 46);
    c.rotate(-0.3);
    rr(c, -12, -40, 24, 80, 3);
    c.fillStyle = '#f6ead2';
    c.fill();
    inkStroke(c, 2.5);
    c.strokeStyle = '#b0303a';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, -30);
    c.lineTo(0, 30);
    c.moveTo(-6, -14);
    c.lineTo(6, -6);
    c.moveTo(-6, 8);
    c.lineTo(6, 16);
    c.stroke();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.ellipse(28, 22, 12, 6, -0.6, 0, Math.PI * 2);
    c.fill();
  });

  canvasTex(scene, 'dot', 16, 16, (c) => {
    const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 16);
  });

  // もくもく煙（輪郭つきのポップな雲）
  canvasTex(scene, 'smoke', 44, 44, (c) => {
    c.beginPath();
    c.arc(22, 22, 17, 0, Math.PI * 2);
    c.fillStyle = '#efe4d2';
    c.fill();
    inkStroke(c, 3.5);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.arc(16, 16, 6, 0, Math.PI * 2);
    c.fill();
  });

  canvasTex(scene, 'spark', 28, 28, (c) => {
    c.translate(14, 14);
    c.beginPath();
    c.moveTo(0, -12);
    c.quadraticCurveTo(2, -2, 12, 0);
    c.quadraticCurveTo(2, 2, 0, 12);
    c.quadraticCurveTo(-2, 2, -12, 0);
    c.quadraticCurveTo(-2, -2, 0, -12);
    c.fillStyle = '#ffffff';
    c.fill();
    inkStroke(c, 2);
  });

  canvasTex(scene, 'confetti', 12, 18, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(1, 1, 10, 16);
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.strokeRect(1, 1, 10, 16);
  });

  canvasTex(scene, 'glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });

  // 色違いカプセルの金の輪
  canvasTex(scene, 'shinyRing', 112, 112, (c) => {
    c.setLineDash([14, 7]);
    c.beginPath();
    c.arc(56, 56, 49, 0, Math.PI * 2);
    c.lineWidth = 11;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = 7;
    c.strokeStyle = '#f2c94c';
    c.stroke();
    c.setLineDash([]);
    // 小さな星
    for (const a of [0.3, 2.4, 4.4]) {
      const x = 56 + Math.cos(a) * 49;
      const y = 56 + Math.sin(a) * 49;
      c.beginPath();
      c.moveTo(x, y - 7);
      c.lineTo(x + 2, y - 2);
      c.lineTo(x + 7, y);
      c.lineTo(x + 2, y + 2);
      c.lineTo(x, y + 7);
      c.lineTo(x - 2, y + 2);
      c.lineTo(x - 7, y);
      c.lineTo(x - 2, y - 2);
      c.closePath();
      c.fillStyle = '#fff6d0';
      c.fill();
    }
  });

  canvasTex(scene, 'ring', 128, 128, (c) => {
    c.beginPath();
    c.arc(64, 64, 56, 0, Math.PI * 2);
    c.lineWidth = 12;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = 6;
    c.strokeStyle = '#ffffff';
    c.stroke();
  });

  // 放射状の光（集中線風。レア演出の背景）
  canvasTex(scene, 'rays', 512, 512, (c) => {
    c.translate(256, 256);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / n / 2;
      const g = c.createRadialGradient(0, 0, 20, 0, 0, 256);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 256, a0, a1);
      c.closePath();
      c.fill();
    }
  });

  // 人魂（淡い炎。発光ではなく半透明のベタで描く）
  canvasTex(scene, 'wisp', 48, 72, (c) => {
    c.beginPath();
    c.moveTo(24, 4);
    c.bezierCurveTo(36, 26, 44, 40, 40, 52);
    c.bezierCurveTo(36, 66, 12, 66, 8, 52);
    c.bezierCurveTo(4, 40, 20, 30, 24, 4);
    c.fillStyle = 'rgba(214,232,240,0.85)';
    c.fill();
    c.beginPath();
    c.ellipse(24, 50, 9, 10, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fill();
  });

  // 提灯
  canvasTex(scene, 'lantern', 90, 150, (c) => {
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(45, 0);
    c.lineTo(45, 22);
    c.stroke();
    rr(c, 27, 18, 36, 12, 4);
    c.fillStyle = '#2b1820';
    c.fill();
    inkStroke(c, 3);
    c.beginPath();
    c.ellipse(45, 74, 38, 46, 0, 0, Math.PI * 2);
    const g = c.createRadialGradient(40, 66, 6, 45, 74, 46);
    g.addColorStop(0, '#f6d58a');
    g.addColorStop(0.7, '#e07b4a');
    g.addColorStop(1, '#b0443a');
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(80,30,30,0.4)';
    c.lineWidth = 2.5;
    for (let y = 36; y < 120; y += 11) {
      c.beginPath();
      c.moveTo(0, y);
      c.quadraticCurveTo(45, y + 6, 90, y);
      c.stroke();
    }
    c.restore();
    c.beginPath();
    c.ellipse(45, 74, 38, 46, 0, 0, Math.PI * 2);
    inkStroke(c, 4);
    rr(c, 27, 116, 36, 12, 4);
    c.fillStyle = '#2b1820';
    c.fill();
    inkStroke(c, 3);
    // 文字「が」
    c.font = '900 34px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#7a2a28';
    c.fillText('が', 45, 76);
    // 房
    c.strokeStyle = '#b0443a';
    c.lineWidth = 3;
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(45 + i * 3, 128);
      c.lineTo(45 + i * 4, 146);
      c.stroke();
    }
  });

  // 暗がりの目（2 つ）
  canvasTex(scene, 'eyes', 60, 24, (c) => {
    for (const x of [16, 44]) {
      c.beginPath();
      c.ellipse(x, 12, 9, 7, 0, 0, Math.PI * 2);
      c.fillStyle = '#e9dca0';
      c.fill();
      c.beginPath();
      c.ellipse(x + 1, 12, 2.5, 5.5, 0, 0, Math.PI * 2);
      c.fillStyle = '#120a14';
      c.fill();
    }
  });

  canvasTex(scene, 'coin', 44, 44, (c) => {
    c.beginPath();
    c.arc(22, 24, 18, 0, Math.PI * 2);
    c.fillStyle = INK;
    c.fill();
    c.beginPath();
    c.arc(22, 21, 18, 0, Math.PI * 2);
    c.fillStyle = '#e8b13a';
    c.fill();
    inkStroke(c, 3.5);
    // 四角い穴（古銭風）
    rr(c, 17, 16, 10, 10, 2);
    c.fillStyle = INK;
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.ellipse(14, 13, 5, 3, -0.6, 0, Math.PI * 2);
    c.fill();
  });

  // 金属シャッター（閉店・ゲームオーバー）
  canvasTex(scene, 'shutter', GAME_W, 48, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, '#8d8798');
    g.addColorStop(0.5, '#b8b2c2');
    g.addColorStop(1, '#6e6878');
    c.fillStyle = g;
    c.fillRect(0, 0, GAME_W, 48);
    c.fillStyle = '#4a4452';
    c.fillRect(0, 44, GAME_W, 4);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(0, 6, GAME_W, 3);
  });

  // ---- アイコン ----
  icon(scene, 'ic_sell', (c) => {
    // 値札
    c.rotate(-0.35);
    c.beginPath();
    c.moveTo(-12, -24);
    c.lineTo(16, -24);
    c.lineTo(16, 22);
    c.lineTo(2, 30);
    c.lineTo(-12, 22);
    c.closePath();
    c.fillStyle = '#f6ead2';
    c.fill();
    inkStroke(c, 4);
    c.beginPath();
    c.arc(2, -14, 4, 0, Math.PI * 2);
    inkStroke(c, 3);
    c.font = '900 20px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#d94b3d';
    c.fillText('¥', 2, 14);
  });
  icon(scene, 'ic_baito', (c) => {
    // スパナ
    c.rotate(0.7);
    rr(c, -6, -8, 12, 38, 5);
    c.fillStyle = '#d9d4de';
    c.fill();
    inkStroke(c, 4);
    c.beginPath();
    c.arc(0, -16, 15, 0, Math.PI * 2);
    c.fillStyle = '#d9d4de';
    c.fill();
    inkStroke(c, 4);
    rr(c, -6, -34, 12, 18, 2);
    c.fillStyle = '#5f9fae';
    c.fill();
  });
  icon(scene, 'ic_close', (c) => {
    // シャッター
    rr(c, -24, -24, 48, 48, 6);
    c.fillStyle = '#b8b2c2';
    c.fill();
    inkStroke(c, 4);
    c.strokeStyle = 'rgba(36,23,46,0.6)';
    c.lineWidth = 3;
    for (let y = -14; y <= 14; y += 9) {
      c.beginPath();
      c.moveTo(-20, y);
      c.lineTo(20, y);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(-8, 26);
    c.lineTo(8, 26);
    inkStroke(c, 5);
  });
  // AP（提灯：点灯 / 消灯）
  for (const on of [true, false]) {
    canvasTex(scene, on ? 'ap_on' : 'ap_off', 30, 40, (c) => {
      c.beginPath();
      c.ellipse(15, 21, 12, 15, 0, 0, Math.PI * 2);
      c.fillStyle = on ? '#e9874f' : '#4a3a4e';
      c.fill();
      inkStroke(c, 3);
      if (on) {
        c.beginPath();
        c.ellipse(13, 19, 5, 8, 0, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,232,170,0.75)';
        c.fill();
      }
      c.fillStyle = INK;
      c.fillRect(9, 3, 12, 4);
      c.fillRect(9, 35, 12, 4);
    });
  }

  // バイト用：コンベア・カップ・蓋
  canvasTex(scene, 'belt', 64, 44, (c) => {
    c.fillStyle = '#4a3c4e';
    c.fillRect(0, 0, 64, 44);
    c.fillStyle = '#5c4c60';
    c.fillRect(0, 0, 30, 44);
    c.fillStyle = INK;
    c.fillRect(0, 0, 64, 4);
    c.fillRect(0, 40, 64, 4);
  });
  canvasTex(scene, 'cup', 76, 44, (c) => {
    c.beginPath();
    c.moveTo(5, 5);
    c.lineTo(71, 5);
    c.arc(38, 5, 33, 0, Math.PI, false);
    c.closePath();
    c.fillStyle = '#f3e9d6';
    c.fill();
    inkStroke(c, 4);
  });
  for (const r of ['N', 'R', 'SR'] as Rarity[]) {
    canvasTex(scene, `lid_${r}`, 76, 44, (c) => {
      c.beginPath();
      c.moveTo(5, 39);
      c.lineTo(71, 39);
      c.arc(38, 39, 33, 0, Math.PI, true);
      c.closePath();
      c.fillStyle = RARITY_INFO[r].css;
      c.fill();
      inkStroke(c, 4);
      c.fillStyle = 'rgba(255,255,255,0.65)';
      c.beginPath();
      c.ellipse(26, 20, 7, 4, -0.5, 0, Math.PI * 2);
      c.fill();
    });
  }

  // サブ画面の背景
  canvasTex(scene, 'bg_plum', GAME_W, GAME_H, (c) => paintDuskBg(c, GAME_W, GAME_H, 'plum'));
  canvasTex(scene, 'bg_back', GAME_W, GAME_H, (c) => paintDuskBg(c, GAME_W, GAME_H, 'back'));
  canvasTex(scene, 'bg_night', GAME_W, GAME_H, (c) => paintDuskBg(c, GAME_W, GAME_H, 'night'));
}
