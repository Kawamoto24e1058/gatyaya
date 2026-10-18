// Canvas で描く図形ベースのアート。画像素材は使わない。
// 画風：太い墨線＋ベタ影のポップさに、目玉・お札・人魂などの少し不気味な要素を混ぜる。
// 妖怪モチーフは民話由来の一般的な意匠（提灯お化け・猫又・一つ目など）に留め、特定作品のキャラクターは描かない。
import type { Prize } from '../data/prizes';
import type { Rarity } from '../data/rarity';

export const INK = '#24172e';
type C = CanvasRenderingContext2D;

export function rr(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function inkStroke(c: C, w = 5) {
  c.lineWidth = w;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
}

function fillInk(c: C, color: string, w = 5) {
  c.fillStyle = color;
  c.fill();
  inkStroke(c, w);
}

function circle(c: C, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

// ---------------- 顔パーツ ----------------

type EyeStyle = 'dot' | 'sleepy' | 'one' | 'screen' | 'mad';

function face(c: C, cx: number, cy: number, style: EyeStyle, scale = 1) {
  const g = 17 * scale;
  c.save();
  switch (style) {
    case 'dot':
      for (const s of [-1, 1]) {
        circle(c, cx + s * g, cy, 6 * scale);
        c.fillStyle = INK;
        c.fill();
        circle(c, cx + s * g - 2, cy - 2.5, 2 * scale);
        c.fillStyle = '#fff';
        c.fill();
      }
      break;
    case 'sleepy':
      for (const s of [-1, 1]) {
        c.beginPath();
        c.arc(cx + s * g, cy - 2, 7 * scale, 0.15 * Math.PI, 0.85 * Math.PI);
        inkStroke(c, 4);
      }
      break;
    case 'mad':
      for (const s of [-1, 1]) {
        circle(c, cx + s * g, cy, 7 * scale);
        fillInk(c, '#fff8e8', 3);
        circle(c, cx + s * g + s * -1, cy + 1, 3.5 * scale);
        c.fillStyle = INK;
        c.fill();
        c.beginPath();
        c.moveTo(cx + s * (g + 9), cy - 12 * scale);
        c.lineTo(cx + s * (g - 7), cy - 7 * scale);
        inkStroke(c, 4);
      }
      break;
    case 'one': {
      circle(c, cx, cy, 17 * scale);
      fillInk(c, '#fff8e8', 4);
      circle(c, cx + 2, cy + 2, 8.5 * scale);
      c.fillStyle = INK;
      c.fill();
      circle(c, cx - 2, cy - 2, 3 * scale);
      c.fillStyle = '#fff';
      c.fill();
      // 血走り
      c.strokeStyle = '#c2414a';
      c.lineWidth = 1.5;
      for (const a of [0.2, 2.6, 4.1]) {
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * 16 * scale, cy + Math.sin(a) * 16 * scale);
        c.lineTo(cx + Math.cos(a + 0.2) * 10 * scale, cy + Math.sin(a + 0.2) * 10 * scale);
        c.stroke();
      }
      break;
    }
    case 'screen':
      rr(c, cx - 30 * scale, cy - 13 * scale, 60 * scale, 26 * scale, 8);
      fillInk(c, '#2b3a3f', 4);
      for (const s of [-1, 1]) {
        rr(c, cx + s * 13 * scale - 5, cy - 6 * scale, 10, 12 * scale, 3);
        c.fillStyle = '#d6f0e0';
        c.fill();
      }
      break;
  }
  c.restore();
}

function mouth(c: C, cx: number, cy: number, kind: 'w' | 'o' | 'tongue' | 'fang') {
  c.save();
  if (kind === 'w') {
    c.beginPath();
    c.arc(cx - 5, cy, 5, 0, Math.PI);
    c.arc(cx + 5, cy, 5, 0, Math.PI);
    inkStroke(c, 3.5);
  } else if (kind === 'o') {
    c.beginPath();
    c.ellipse(cx, cy + 2, 5, 6, 0, 0, Math.PI * 2);
    fillInk(c, '#7a2f3a', 3);
  } else if (kind === 'tongue') {
    c.beginPath();
    c.arc(cx, cy, 9, 0, Math.PI);
    fillInk(c, '#3a1a24', 3);
    c.beginPath();
    c.moveTo(cx - 5, cy + 2);
    c.quadraticCurveTo(cx, cy + 26, cx + 6, cy + 4);
    fillInk(c, '#e0607a', 3);
  } else {
    c.beginPath();
    c.moveTo(cx - 12, cy);
    c.quadraticCurveTo(cx, cy + 10, cx + 12, cy);
    inkStroke(c, 3.5);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 7 - 3, cy + 3);
      c.lineTo(cx + s * 7, cy + 11);
      c.lineTo(cx + s * 7 + 3, cy + 3);
      fillInk(c, '#fff', 2);
    }
  }
  c.restore();
}

function blush(c: C, cx: number, cy: number, gap: number) {
  c.fillStyle = 'rgba(230,110,130,0.45)';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(cx + s * gap, cy, 8, 4.5, 0, 0, Math.PI * 2);
    c.fill();
  }
}

// ---------------- アクセサリ（レア度で増える） ----------------

function crown(c: C, cx: number, top: number) {
  c.beginPath();
  c.moveTo(cx - 22, top + 18);
  c.lineTo(cx - 24, top);
  c.lineTo(cx - 11, top + 9);
  c.lineTo(cx, top - 6);
  c.lineTo(cx + 11, top + 9);
  c.lineTo(cx + 24, top);
  c.lineTo(cx + 22, top + 18);
  c.closePath();
  fillInk(c, '#e8b13a', 4);
  circle(c, cx, top + 10, 3.5);
  c.fillStyle = '#d94b3d';
  c.fill();
}

function horns(c: C, cx: number, top: number, color = '#f6ead2') {
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(cx + s * 16, top + 10);
    c.quadraticCurveTo(cx + s * 30, top - 6, cx + s * 22, top - 18);
    c.quadraticCurveTo(cx + s * 20, top - 2, cx + s * 6, top + 6);
    fillInk(c, color, 4);
  }
}

function halo(c: C, cx: number, cy: number, r: number, rainbow: boolean) {
  c.save();
  if (rainbow) {
    const cols = ['#d94b6a', '#e8b13a', '#5a9a6e', '#3f8f96', '#9b6bc4'];
    cols.forEach((col, i) => {
      c.beginPath();
      c.arc(cx, cy, r - i * 4, Math.PI * 1.05, Math.PI * 1.95);
      c.strokeStyle = col;
      c.lineWidth = 4;
      c.stroke();
    });
  } else {
    c.setLineDash([6, 7]);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(232,177,58,0.9)';
    c.lineWidth = 4;
    c.stroke();
  }
  c.restore();
}

function sparkle(c: C, x: number, y: number, s: number, col = '#fff6d0') {
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x + s * 0.15, y - s * 0.15, x + s, y);
  c.quadraticCurveTo(x + s * 0.15, y + s * 0.15, x, y + s);
  c.quadraticCurveTo(x - s * 0.15, y + s * 0.15, x - s, y);
  c.quadraticCurveTo(x - s * 0.15, y - s * 0.15, x, y - s);
  fillInk(c, col, 2.5);
}

// ---------------- シリーズ別の本体 ----------------

const MOCHI_COLORS: Record<Rarity, [string, string]> = {
  N: ['#e2c48a', '#7a4652'],
  R: ['#a9cf78', '#dfa252'],
  SR: ['#f0aebd', '#cfc095'],
  SSR: ['#f7f1e6', '#9d87b8'],
  UR: ['#efc54e', '#e58aa8'],
};
const NEJI_COLORS: Record<Rarity, [string, string]> = {
  N: ['#b9bec4', '#c9a26a'],
  R: ['#d0905a', '#8fb7a8'],
  SR: ['#b78b4c', '#8aa6c4'],
  SSR: ['#5f8a6e', '#c9a24c'],
  UR: ['#d7b25a', '#7f6bb0'],
};
const OBAKE_COLORS: Record<Rarity, [string, string]> = {
  N: ['#f1d9a8', '#e8e2f2'],
  R: ['#d9e3ee', '#f0c27a'],
  SR: ['#cfc6e6', '#e8dfc8'],
  SSR: ['#8d7bb5', '#e2b54a'],
  UR: ['#f2d06b', '#f3c4d0'],
};

function drawMochi(c: C, r: Rarity, k: number) {
  const col = MOCHI_COLORS[r][k];
  const cx = 80;
  const cy = 92;
  if (r === 'UR') halo(c, cx, cy, 70, k === 1);
  // SR：土星の輪（後ろ半分）
  const ring = r === 'SR' || r === 'UR';
  if (ring) {
    c.beginPath();
    c.ellipse(cx, cy + 4, 70, 18, -0.25, Math.PI, Math.PI * 2);
    inkStroke(c, 10);
    c.strokeStyle = r === 'UR' ? '#e8b13a' : '#f6ead2';
    c.lineWidth = 5;
    c.stroke();
  }
  // ぷにっとした本体（底が少しつぶれた形）
  c.beginPath();
  c.moveTo(cx - 52, cy + 22);
  c.bezierCurveTo(cx - 62, cy - 40, cx + 62, cy - 40, cx + 52, cy + 22);
  c.bezierCurveTo(cx + 44, cy + 46, cx - 44, cy + 46, cx - 52, cy + 22);
  c.closePath();
  const g = c.createLinearGradient(0, cy - 40, 0, cy + 40);
  g.addColorStop(0, shade(col, 0.25));
  g.addColorStop(1, shade(col, -0.12));
  c.fillStyle = g;
  c.fill();
  inkStroke(c, 5);
  // クレーター
  c.fillStyle = shade(col, -0.18);
  for (const [x, y, s] of [
    [cx + 30, cy - 14, 6],
    [cx - 34, cy + 10, 4],
    [cx + 22, cy + 22, 3.5],
  ]) {
    circle(c, x, y, s);
    c.fill();
  }
  if (ring) {
    c.beginPath();
    c.ellipse(cx, cy + 4, 70, 18, -0.25, 0, Math.PI);
    inkStroke(c, 10);
    c.strokeStyle = r === 'UR' ? '#e8b13a' : '#f6ead2';
    c.lineWidth = 5;
    c.stroke();
  }
  if (r === 'R') {
    circle(c, cx + 52, cy - 46, 12);
    fillInk(c, '#f6ead2', 4);
    face(c, cx + 52, cy - 46, 'dot', 0.35);
  }
  const style: EyeStyle = r === 'SSR' ? 'one' : r === 'SR' ? 'sleepy' : 'dot';
  face(c, cx, cy - 2, style);
  if (r !== 'SSR') blush(c, cx, cy + 8, 30);
  mouth(c, cx, cy + 16, r === 'SSR' ? 'fang' : r === 'UR' ? 'o' : 'w');
  if (r === 'SSR') horns(c, cx, cy - 44);
  if (r === 'UR') crown(c, cx, cy - 62);
}

function drawNeji(c: C, r: Rarity, k: number) {
  const col = NEJI_COLORS[r][k];
  const cx = 80;
  const cy = 92;
  if (r === 'UR') halo(c, cx, cy, 70, k === 1);
  // SR 以上：背後の歯車
  if (r === 'SR' || r === 'SSR' || r === 'UR') {
    c.save();
    c.translate(cx + 34, cy - 30);
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rad = i % 2 === 0 ? 30 : 22;
      c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    c.closePath();
    fillInk(c, '#c9a24c', 4);
    circle(c, 0, 0, 8);
    fillInk(c, '#7a4a34', 3);
    c.restore();
  }
  if (r === 'N') {
    // 六角ナット
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      c.lineTo(cx + Math.cos(a) * 54, cy + Math.sin(a) * 50);
    }
    c.closePath();
    const g = c.createLinearGradient(0, cy - 50, 0, cy + 50);
    g.addColorStop(0, shade(col, 0.35));
    g.addColorStop(1, shade(col, -0.15));
    c.fillStyle = g;
    c.fill();
    inkStroke(c, 5);
    face(c, cx, cy - 6, 'dot');
    mouth(c, cx, cy + 14, 'o');
    return;
  }
  // ロボ頭
  if (r === 'R') {
    // ばねのアンテナ
    c.beginPath();
    c.moveTo(cx, cy - 40);
    for (let i = 0; i < 6; i++) c.lineTo(cx + (i % 2 ? 8 : -8), cy - 44 - i * 5);
    inkStroke(c, 4);
    circle(c, cx, cy - 76, 7);
    fillInk(c, '#d94b3d', 3);
  }
  rr(c, cx - 48, cy - 42, 96, 84, 18);
  const g = c.createLinearGradient(0, cy - 42, 0, cy + 42);
  g.addColorStop(0, shade(col, 0.35));
  g.addColorStop(1, shade(col, -0.18));
  c.fillStyle = g;
  c.fill();
  inkStroke(c, 5);
  // ボルト
  for (const s of [-1, 1]) {
    circle(c, cx + s * 52, cy, 8);
    fillInk(c, shade(col, -0.25), 4);
  }
  // リベット
  c.fillStyle = shade(col, -0.3);
  for (const [x, y] of [
    [cx - 38, cy - 32],
    [cx + 38, cy - 32],
    [cx - 38, cy + 32],
    [cx + 38, cy + 32],
  ]) {
    circle(c, x, y, 3);
    c.fill();
  }
  if (r === 'SSR') {
    face(c, cx, cy - 6, 'mad');
    mouth(c, cx, cy + 22, 'fang');
    // 翼
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 50, cy - 20);
      c.lineTo(cx + s * 76, cy - 44);
      c.lineTo(cx + s * 70, cy - 14);
      c.lineTo(cx + s * 78, cy - 4);
      c.lineTo(cx + s * 52, cy + 4);
      fillInk(c, '#b0303a', 4);
    }
  } else {
    face(c, cx, cy - 4, 'screen');
    mouth(c, cx, cy + 24, 'w');
  }
  if (r === 'UR') crown(c, cx, cy - 64);
}

function drawObake(c: C, r: Rarity, k: number) {
  const col = OBAKE_COLORS[r][k];
  const cx = 80;
  const cy = 90;
  if (r === 'UR') halo(c, cx, cy, 70, k === 1);
  if (r === 'N' && k === 0) {
    // 提灯お化け
    c.beginPath();
    c.ellipse(cx, cy + 4, 44, 52, 0, 0, Math.PI * 2);
    c.fillStyle = col;
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(122,74,52,0.45)';
    c.lineWidth = 3;
    for (let y = cy - 44; y < cy + 56; y += 13) {
      c.beginPath();
      c.moveTo(cx - 50, y);
      c.quadraticCurveTo(cx, y + 6, cx + 50, y);
      c.stroke();
    }
    c.restore();
    c.beginPath();
    c.ellipse(cx, cy + 4, 44, 52, 0, 0, Math.PI * 2);
    inkStroke(c, 5);
    for (const y of [cy - 50, cy + 56]) {
      rr(c, cx - 22, y - 7, 44, 14, 5);
      fillInk(c, '#3a2230', 4);
    }
    face(c, cx, cy - 8, 'one', 0.8);
    mouth(c, cx, cy + 22, 'tongue');
    return;
  }
  // 布おばけ（猫又は耳としっぽ付き）
  const cat = r === 'SR';
  if (cat) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 50, cy + 30);
      c.quadraticCurveTo(cx + s * 80, cy + 10, cx + s * 70, cy - 24);
      inkStroke(c, 12);
      c.strokeStyle = col;
      c.lineWidth = 6;
      c.stroke();
    }
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 16, cy - 40);
      c.lineTo(cx + s * 32, cy - 62);
      c.lineTo(cx + s * 40, cy - 28);
      fillInk(c, col, 4);
    }
  }
  c.beginPath();
  c.moveTo(cx - 46, cy + 46);
  c.lineTo(cx - 46, cy - 6);
  c.arc(cx, cy - 6, 46, Math.PI, 0);
  c.lineTo(cx + 46, cy + 46);
  for (let i = 0; i < 4; i++) {
    const x0 = cx + 46 - i * 23;
    c.quadraticCurveTo(x0 - 11.5, cy + (i % 2 ? 34 : 60), x0 - 23, cy + 46);
  }
  c.closePath();
  const g = c.createLinearGradient(0, cy - 52, 0, cy + 60);
  g.addColorStop(0, shade(col, 0.3));
  g.addColorStop(1, shade(col, -0.12));
  c.fillStyle = g;
  c.fill();
  inkStroke(c, 5);
  // 小さな手
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(cx + s * 50, cy + 14, 9, 6, s * 0.6, 0, Math.PI * 2);
    fillInk(c, col, 4);
  }
  if (r === 'SSR') {
    face(c, cx, cy - 8, 'one');
    mouth(c, cx, cy + 22, 'fang');
    horns(c, cx, cy - 48);
  } else {
    face(c, cx, cy - 6, r === 'R' && k === 1 ? 'sleepy' : 'dot');
    blush(c, cx, cy + 6, 28);
    mouth(c, cx, cy + 16, r === 'R' || r === 'N' ? 'tongue' : 'w');
  }
  if (r === 'R') {
    // 人魂のおとも
    c.beginPath();
    c.moveTo(cx + 62, cy - 54);
    c.quadraticCurveTo(cx + 46, cy - 40, cx + 58, cy - 28);
    c.quadraticCurveTo(cx + 72, cy - 34, cx + 62, cy - 54);
    fillInk(c, '#cfe3ef', 3);
  }
  if (r === 'UR') crown(c, cx, cy - 72);
}

/** 景品の絵（160×160） */
export function drawPrizeArt(c: C, p: Prize) {
  const k = Number(p.id.split('_').pop()) || 0;
  c.save();
  if (p.seriesId === 'mochi') drawMochi(c, p.rarity, k);
  else if (p.seriesId === 'neji') drawNeji(c, p.rarity, k);
  else drawObake(c, p.rarity, k);
  if (p.rarity !== 'N' && p.rarity !== 'R') {
    sparkle(c, 22, 26, 9);
    sparkle(c, 140, 132, 7);
  }
  c.restore();
}

// ---------------- 背景 ----------------

export type ShopBgLayout = { w: number; h: number; hudBottom: number; counterY: number };

/** 店内の背景：夕暮れの窓、板壁、トレカ棚、お札、カウンター */
export function paintShopBg(c: C, L: ShopBgLayout) {
  const { w, h, hudBottom, counterY } = L;
  // 板壁
  const wall = c.createLinearGradient(0, 0, 0, counterY);
  wall.addColorStop(0, '#2c1b2e');
  wall.addColorStop(1, '#4a2b3a');
  c.fillStyle = wall;
  c.fillRect(0, 0, w, counterY);
  for (let x = 0; x < w; x += 60) {
    c.fillStyle = (x / 60) % 2 ? 'rgba(255,220,200,0.035)' : 'rgba(0,0,0,0.06)';
    c.fillRect(x, 0, 60, counterY);
    c.fillStyle = 'rgba(20,10,20,0.35)';
    c.fillRect(x, 0, 3, counterY);
    // 木目
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 2;
    c.beginPath();
    const ox = x + 20 + ((x * 7) % 23);
    c.moveTo(ox, 0);
    c.bezierCurveTo(ox + 8, counterY * 0.3, ox - 8, counterY * 0.6, ox + 4, counterY);
    c.stroke();
  }

  // 夕暮れの窓（左上）
  const wx = 26;
  const wy = hudBottom + 26;
  const ww = 150;
  const wh = 190;
  const sky = c.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, '#3b2a55');
  sky.addColorStop(0.55, '#a5546a');
  sky.addColorStop(1, '#e9925a');
  c.fillStyle = sky;
  c.fillRect(wx, wy, ww, wh);
  // 月
  circle(c, wx + 108, wy + 44, 16);
  c.fillStyle = '#f6e7c4';
  c.fill();
  circle(c, wx + 100, wy + 40, 14);
  c.fillStyle = '#3f2b57';
  c.fill();
  // 屋根の影（少し傾いた家並み）
  c.fillStyle = '#2a1830';
  c.beginPath();
  c.moveTo(wx, wy + wh);
  const roofs = [
    [0, 130],
    [20, 112],
    [44, 128],
    [44, 104],
    [70, 90],
    [96, 108],
    [96, 120],
    [118, 98],
    [150, 116],
  ];
  for (const [x, y] of roofs) c.lineTo(wx + x, wy + y);
  c.lineTo(wx + ww, wy + wh);
  c.closePath();
  c.fill();
  // 電柱と電線
  c.fillRect(wx + 30, wy + 60, 4, 80);
  c.strokeStyle = '#2a1830';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(wx, wy + 70);
  c.quadraticCurveTo(wx + 32, wy + 82, wx + 32, wy + 64);
  c.quadraticCurveTo(wx + 90, wy + 86, wx + ww, wy + 66);
  c.stroke();
  // 窓枠と桟
  c.strokeStyle = '#2a1520';
  c.lineWidth = 6;
  c.strokeRect(wx + ww / 2 - 1, wy, 2, wh);
  c.strokeRect(wx, wy + wh / 2 - 1, ww, 2);
  rr(c, wx - 6, wy - 6, ww + 12, wh + 12, 6);
  c.lineWidth = 12;
  c.strokeStyle = '#6b402e';
  c.stroke();
  inkStroke(c, 4);

  // お札（窓の横）
  c.save();
  c.translate(wx + ww + 30, wy + 30);
  c.rotate(0.08);
  rr(c, -15, 0, 30, 92, 3);
  fillInk(c, '#efe2c2', 3);
  c.strokeStyle = '#b0303a';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(0, 12);
  c.lineTo(0, 80);
  for (let y = 22; y < 78; y += 14) {
    c.moveTo(-8, y);
    c.quadraticCurveTo(0, y + 6, 8, y);
  }
  c.stroke();
  c.restore();

  // トレカ棚（右上）
  const sx = 548;
  const sy = hudBottom + 22;
  const sw = 150;
  const rows = 3;
  rr(c, sx - 8, sy - 8, sw + 16, rows * 64 + 16, 8);
  fillInk(c, '#5c3626', 4);
  const cardCols = ['#e8879c', '#5f9fae', '#8f78c0', '#e3a53a', '#d8d0be', '#5b8fc9'];
  for (let r = 0; r < rows; r++) {
    c.fillStyle = '#2b1820';
    c.fillRect(sx, sy + r * 64, sw, 56);
    for (let i = 0; i < 5; i++) {
      const col = cardCols[(r * 5 + i * 3) % cardCols.length];
      c.save();
      c.translate(sx + 16 + i * 30, sy + r * 64 + 30);
      c.rotate(((i + r) % 3) * 0.05 - 0.05);
      rr(c, -12, -22, 24, 44, 3);
      fillInk(c, col, 2.5);
      rr(c, -8, -18, 16, 20, 2);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fill();
      c.restore();
    }
    c.fillStyle = '#7a4a34';
    c.fillRect(sx - 8, sy + r * 64 + 56, sw + 16, 8);
  }
  // 棚の下の暗がり（目が光る場所）
  rr(c, sx, sy + rows * 64 + 14, sw, 44, 10);
  c.fillStyle = '#120a14';
  c.fill();

  // 床とカウンター
  const counter = c.createLinearGradient(0, counterY, 0, h);
  counter.addColorStop(0, '#3a2228');
  counter.addColorStop(1, '#22141c');
  c.fillStyle = counter;
  c.fillRect(0, counterY, w, h - counterY);
  // 天板
  c.fillStyle = '#8a5638';
  c.fillRect(0, counterY - 6, w, 26);
  c.fillStyle = 'rgba(255,230,200,0.18)';
  c.fillRect(0, counterY - 6, w, 6);
  c.fillStyle = '#24172e';
  c.fillRect(0, counterY + 20, w, 5);
  // 前板の縦板
  for (let x = 0; x < w; x += 90) {
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(x, counterY + 25, 3, h - counterY);
  }

  // 四隅を暗く（ビネット）
  const vg = c.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h * 0.5, h * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,4,12,0.55)');
  c.fillStyle = vg;
  c.fillRect(0, 0, w, h);
}

/** 汎用：夕暮れ〜夜の背景（サブ画面用） */
export function paintDuskBg(c: C, w: number, h: number, tone: 'plum' | 'back' | 'night') {
  const g = c.createLinearGradient(0, 0, 0, h);
  if (tone === 'plum') {
    g.addColorStop(0, '#2a1a30');
    g.addColorStop(1, '#4a2a3e');
  } else if (tone === 'back') {
    g.addColorStop(0, '#2a2433');
    g.addColorStop(1, '#3a2c33');
  } else {
    g.addColorStop(0, '#120a16');
    g.addColorStop(1, '#24152a');
  }
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // 細かいざらつき（紙っぽさ）
  for (let i = 0; i < 900; i++) {
    c.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,220,0.025)' : 'rgba(0,0,0,0.05)';
    c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  const vg = c.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(6,2,8,0.6)');
  c.fillStyle = vg;
  c.fillRect(0, 0, w, h);
}
