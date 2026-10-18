// 外部画像は使わず、起動時に Canvas でテクスチャを生成する。
import Phaser from 'phaser';
import { RARITIES, RARITY_INFO, type Rarity } from '../data/rarity';

export const capsuleKey = (r: Rarity) => `cap_${r}`;

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function drawCapsule(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, rarity: Rarity) {
  const info = RARITY_INFO[rarity];
  // 下半分：白
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = '#f6f3ee';
  c.fillRect(cx - r, cy, r * 2, r);
  // 上半分：レア度色
  if (rarity === 'UR') {
    const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy);
    ['#ff4f8b', '#ffb34f', '#fff15a', '#5effa0', '#5ec8ff', '#b066ff'].forEach((col, i, a) =>
      g.addColorStop(i / (a.length - 1), col),
    );
    c.fillStyle = g;
  } else if (rarity === 'SSR') {
    const g = c.createLinearGradient(cx, cy - r, cx, cy);
    g.addColorStop(0, '#fff2a8');
    g.addColorStop(1, '#f2a91a');
    c.fillStyle = g;
  } else {
    c.fillStyle = info.css;
  }
  c.fillRect(cx - r, cy - r, r * 2, r);
  // 下半分の影
  const sh = c.createLinearGradient(cx, cy, cx, cy + r);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.18)');
  c.fillStyle = sh;
  c.fillRect(cx - r, cy, r * 2, r);
  c.restore();
  // 合わせ目
  c.strokeStyle = 'rgba(42,31,69,0.55)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(cx - r + 1, cy);
  c.lineTo(cx + r - 1, cy);
  c.stroke();
  // 外周
  c.lineWidth = 3;
  c.strokeStyle = '#2a1f45';
  c.beginPath();
  c.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
  c.stroke();
  // ハイライト
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath();
  c.ellipse(cx - r * 0.38, cy - r * 0.5, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  c.fill();
  // レア度の刻印
  if (info.index >= 1) {
    c.fillStyle = 'rgba(42,31,69,0.75)';
    c.font = `bold ${Math.round(r * 0.42)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(rarity, cx, cy + r * 0.45);
  }
}

export function makeTextures(scene: Phaser.Scene): void {
  for (const r of RARITIES) {
    const rad = RARITY_INFO[r].radius;
    const size = rad * 2 + 2;
    canvasTex(scene, capsuleKey(r), size, size, (c) => drawCapsule(c, size / 2, size / 2, rad, r));
  }

  canvasTex(scene, 'dot', 16, 16, (c) => {
    const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 16);
  });

  canvasTex(scene, 'smoke', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  });

  canvasTex(scene, 'spark', 24, 24, (c) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(12, 0);
    c.quadraticCurveTo(13.5, 10.5, 24, 12);
    c.quadraticCurveTo(13.5, 13.5, 12, 24);
    c.quadraticCurveTo(10.5, 13.5, 0, 12);
    c.quadraticCurveTo(10.5, 10.5, 12, 0);
    c.fill();
  });

  canvasTex(scene, 'glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });

  canvasTex(scene, 'ring', 128, 128, (c) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 8;
    c.beginPath();
    c.arc(64, 64, 58, 0, Math.PI * 2);
    c.stroke();
  });

  canvasTex(scene, 'coin', 40, 40, (c) => {
    c.fillStyle = '#b8860b';
    c.beginPath();
    c.arc(20, 21, 18, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffc531';
    c.beginPath();
    c.arc(20, 19, 18, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#e09a10';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(20, 19, 12, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.ellipse(13, 12, 5, 3, -0.6, 0, Math.PI * 2);
    c.fill();
  });

  // バイト「カプセル詰め」用：蓋なし（下半分）と蓋
  canvasTex(scene, 'cup', 72, 40, (c) => {
    c.fillStyle = '#f6f3ee';
    c.strokeStyle = '#2a1f45';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(4, 4);
    c.lineTo(68, 4);
    c.arc(36, 4, 32, 0, Math.PI, false);
    c.closePath();
    c.fill();
    c.stroke();
  });
  for (const r of ['N', 'R', 'SR'] as Rarity[]) {
    canvasTex(scene, `lid_${r}`, 72, 40, (c) => {
      c.fillStyle = hex(RARITY_INFO[r].color);
      c.strokeStyle = '#2a1f45';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(4, 36);
      c.lineTo(68, 36);
      c.arc(36, 36, 32, 0, Math.PI, true);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.65)';
      c.beginPath();
      c.ellipse(24, 18, 7, 4, -0.5, 0, Math.PI * 2);
      c.fill();
    });
  }
}
