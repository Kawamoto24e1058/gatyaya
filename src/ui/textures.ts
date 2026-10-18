// 外部画像は使わず、起動時に Canvas でテクスチャを生成する。
import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { PRIZES, SERIES } from '../data/prizes';
import { RARITIES, RARITY_INFO, type Rarity } from '../data/rarity';
import { drawPrizeArt, INK, inkStroke, paintDuskBg, rr } from './art';

export const capsuleKey = (r: Rarity) => `cap_${r}`;
export const artKey = (prizeId: string) => `art_${prizeId}`;
export const cardKey = (r: Rarity, seriesId: string) => `card_${r}_${seriesId}`;
export const CARD_W = 240;
export const CARD_H = 336;

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

/** トレカの枠（レア度で枠の色、シリーズで絵の背景色） */
function drawCardFrame(c: C, r: Rarity, seriesColor: string) {
  const info = RARITY_INFO[r];
  const W = CARD_W;
  const H = CARD_H;
  rr(c, 4, 4, W - 8, H - 8, 18);
  if (r === 'UR') c.fillStyle = holoGradient(c, 0, 0, W, H);
  else if (r === 'SSR') {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#f6dd8a');
    g.addColorStop(0.5, '#d9a23a');
    g.addColorStop(1, '#f2cf72');
    c.fillStyle = g;
  } else c.fillStyle = info.css;
  c.fill();
  inkStroke(c, 6);
  // 絵の窓
  rr(c, 18, 44, W - 36, 172, 10);
  const bg = c.createLinearGradient(0, 44, 0, 216);
  bg.addColorStop(0, seriesColor);
  bg.addColorStop(1, '#2c1b2e');
  c.fillStyle = bg;
  c.fill();
  c.save();
  c.clip();
  // 背景の放射線（集中線）
  c.translate(W / 2, 130);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 14; i++) {
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 200, (i / 14) * Math.PI * 2, (i / 14) * Math.PI * 2 + 0.18);
    c.closePath();
    c.fill();
  }
  c.restore();
  rr(c, 18, 44, W - 36, 172, 10);
  inkStroke(c, 4);
  // 名前の欄
  rr(c, 18, 226, W - 36, 62, 8);
  c.fillStyle = '#f6ead2';
  c.fill();
  inkStroke(c, 3.5);
  // 星（レア度）
  const n = info.index + 1;
  for (let i = 0; i < n; i++) {
    const x = W / 2 + (i - (n - 1) / 2) * 26;
    const y = 308;
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rad = k % 2 === 0 ? 11 : 5;
      c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
    c.fillStyle = '#f2c94c';
    c.fill();
    inkStroke(c, 2.5);
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

  for (const p of PRIZES) canvasTex(scene, artKey(p.id), 160, 160, (c) => drawPrizeArt(c, p));
  for (const r of RARITIES) for (const se of SERIES) canvasTex(scene, cardKey(r, se.id), CARD_W, CARD_H, (c) => drawCardFrame(c, r, se.color));

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

  // トレカの裏面
  canvasTex(scene, 'card_back', 240, 336, (c) => {
    rr(c, 4, 4, 232, 328, 18);
    c.fillStyle = '#3b2440';
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(232,177,58,0.25)';
    c.lineWidth = 3;
    for (let i = -340; i < 340; i += 22) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + 340, 340);
      c.stroke();
    }
    c.restore();
    rr(c, 4, 4, 232, 328, 18);
    inkStroke(c, 6);
    rr(c, 18, 18, 204, 300, 12);
    c.strokeStyle = '#e8b13a';
    c.lineWidth = 3;
    c.stroke();
    // 中央の目の紋
    c.beginPath();
    c.moveTo(60, 168);
    c.quadraticCurveTo(120, 118, 180, 168);
    c.quadraticCurveTo(120, 218, 60, 168);
    c.fillStyle = '#f6ead2';
    c.fill();
    inkStroke(c, 5);
    c.beginPath();
    c.arc(120, 168, 20, 0, Math.PI * 2);
    c.fillStyle = '#d94b3d';
    c.fill();
    inkStroke(c, 4);
    c.beginPath();
    c.arc(120, 168, 8, 0, Math.PI * 2);
    c.fillStyle = INK;
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
