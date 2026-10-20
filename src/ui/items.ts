// 景品を「グッズ」として描く（缶バッジ・シール・キーホルダー・アクスタ・ぬいぐるみ・フィギュア・ホロカード）。
// 同じ絵柄（art.ts の drawPrizeArt）を、グッズの種類ごとの形で包む。
import { SERIES_BY_ID, type Prize } from '../data/prizes';
import { drawPrizeArt, INK, inkStroke, rr } from './art';

export const ITEM_W = 200;
export const ITEM_H = 220;

type C = CanvasRenderingContext2D;

const holoStops = ['#e7798f', '#ebb75a', '#ece08a', '#84c79a', '#79b3c9', '#a78bd0'];

function artCanvas(p: Prize): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 160;
  cv.height = 160;
  const c = cv.getContext('2d');
  if (c) drawPrizeArt(c, p);
  return cv;
}

function metal(c: C, x0: number, y0: number, x1: number, y1: number, gold = false) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  if (gold) {
    g.addColorStop(0, '#f6dd8a');
    g.addColorStop(0.5, '#c8902a');
    g.addColorStop(1, '#f2cf72');
  } else {
    g.addColorStop(0, '#f0eef4');
    g.addColorStop(0.5, '#9d97a8');
    g.addColorStop(1, '#dcd8e2');
  }
  return g;
}

/** ITEM_W × ITEM_H のキャンバスに描く */
export function drawItem(c: C, p: Prize) {
  const art = artCanvas(p);
  const se = SERIES_BY_ID[p.seriesId];
  const cx = ITEM_W / 2;
  const gold = p.rarity === 'UR';

  switch (p.kind) {
    case 'badge': {
      const cy = 112;
      const r = 84;
      // 影
      c.fillStyle = 'rgba(36,23,46,0.35)';
      c.beginPath();
      c.arc(cx + 5, cy + 7, r, 0, Math.PI * 2);
      c.fill();
      // 金属の縁
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = metal(c, 0, cy - r, 0, cy + r);
      c.fill();
      inkStroke(c, 5);
      // 印刷面
      c.save();
      c.beginPath();
      c.arc(cx, cy, r - 9, 0, Math.PI * 2);
      c.clip();
      const bg = c.createRadialGradient(cx, cy - 20, 10, cx, cy, r);
      bg.addColorStop(0, '#fff6e0');
      bg.addColorStop(1, se.color);
      c.fillStyle = bg;
      c.fillRect(0, 0, ITEM_W, ITEM_H);
      c.drawImage(art, cx - 72, cy - 74, 144, 144);
      // ツヤ
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.ellipse(cx - 30, cy - 46, 46, 20, -0.5, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.beginPath();
      c.arc(cx, cy, r - 9, 0, Math.PI * 2);
      inkStroke(c, 3);
      break;
    }
    case 'sticker': {
      // 白フチのダイカット＋めくれた角
      const cy = 112;
      c.save();
      c.translate(cx, cy);
      c.rotate(-0.06);
      c.fillStyle = 'rgba(36,23,46,0.3)';
      rr(c, -82, -80, 170, 170, 34);
      c.fill();
      rr(c, -88, -88, 170, 170, 34);
      c.fillStyle = '#ffffff';
      c.fill();
      inkStroke(c, 4);
      c.drawImage(art, -82, -84, 158, 158);
      // めくれ
      c.beginPath();
      c.moveTo(82, 48);
      c.lineTo(82, 82);
      c.lineTo(48, 82);
      c.closePath();
      c.fillStyle = '#e8e2d6';
      c.fill();
      inkStroke(c, 3);
      c.restore();
      break;
    }
    case 'keychain': {
      // リング＋チェーン＋アクリルのプレート
      c.lineWidth = 7;
      c.strokeStyle = INK;
      c.beginPath();
      c.arc(cx, 22, 16, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 4;
      c.strokeStyle = metal(c, cx - 16, 6, cx + 16, 38);
      c.beginPath();
      c.arc(cx, 22, 16, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 2; i++) {
        c.beginPath();
        c.ellipse(cx, 46 + i * 12, 5, 8, 0, 0, Math.PI * 2);
        c.lineWidth = 4;
        c.strokeStyle = INK;
        c.stroke();
      }
      rr(c, cx - 76, 62, 152, 150, 40);
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.fill();
      inkStroke(c, 4);
      c.drawImage(art, cx - 70, 64, 140, 140);
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.ellipse(cx - 40, 86, 22, 9, -0.6, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'acrylic': {
      // 透明な板＋台座
      rr(c, cx - 70, 196, 140, 20, 6);
      c.fillStyle = 'rgba(220,235,245,0.75)';
      c.fill();
      inkStroke(c, 4);
      rr(c, cx - 82, 10, 164, 192, 22);
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fill();
      inkStroke(c, 4);
      c.drawImage(art, cx - 78, 24, 156, 156);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(cx - 64, 30);
      c.lineTo(cx - 64, 120);
      c.stroke();
      break;
    }
    case 'plush': {
      // ふっくらした布の縁取り＋縫い目＋タグ
      const cy = 110;
      c.beginPath();
      c.ellipse(cx, cy, 92, 96, 0, 0, Math.PI * 2);
      c.fillStyle = se.color;
      c.fill();
      inkStroke(c, 5);
      c.setLineDash([7, 6]);
      c.beginPath();
      c.ellipse(cx, cy, 82, 86, 0, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 3;
      c.stroke();
      c.setLineDash([]);
      c.drawImage(art, cx - 74, cy - 78, 148, 148);
      // タグ
      c.save();
      c.translate(cx + 66, cy + 74);
      c.rotate(0.3);
      rr(c, -14, -8, 28, 34, 4);
      c.fillStyle = '#f6ead2';
      c.fill();
      inkStroke(c, 3);
      c.fillStyle = '#d94b3d';
      c.fillRect(-9, 2, 18, 4);
      c.restore();
      break;
    }
    case 'figure': {
      // 台座の上に立つ
      const by = 188;
      c.beginPath();
      c.ellipse(cx + 4, by + 10, 84, 22, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(36,23,46,0.35)';
      c.fill();
      c.beginPath();
      c.ellipse(cx, by + 6, 80, 20, 0, 0, Math.PI);
      c.lineTo(cx - 80, by - 6);
      c.fillStyle = gold ? '#a8742a' : '#3b2440';
      c.fill();
      c.beginPath();
      c.moveTo(cx - 80, by - 6);
      c.lineTo(cx - 80, by + 6);
      c.ellipse(cx, by + 6, 80, 20, 0, Math.PI, 0, true);
      c.lineTo(cx + 80, by - 6);
      inkStroke(c, 4);
      c.beginPath();
      c.ellipse(cx, by - 6, 80, 20, 0, 0, Math.PI * 2);
      c.fillStyle = gold ? metal(c, cx - 80, 0, cx + 80, 0, true) : '#5b3150';
      c.fill();
      inkStroke(c, 4);
      c.drawImage(art, cx - 82, 18, 164, 164);
      break;
    }
    case 'holo': {
      // ホロ加工のカード
      c.save();
      c.translate(cx, 112);
      c.rotate(0.05);
      rr(c, -70, -98, 140, 196, 12);
      const g = c.createLinearGradient(-70, -98, 70, 98);
      holoStops.forEach((col, i) => g.addColorStop(i / (holoStops.length - 1), col));
      c.fillStyle = g;
      c.fill();
      inkStroke(c, 5);
      rr(c, -58, -84, 116, 120, 6);
      const bg = c.createLinearGradient(0, -84, 0, 36);
      bg.addColorStop(0, se.color);
      bg.addColorStop(1, '#2c1b2e');
      c.fillStyle = bg;
      c.fill();
      inkStroke(c, 3);
      c.drawImage(art, -58, -90, 116, 116);
      rr(c, -58, 46, 116, 38, 6);
      c.fillStyle = '#f6ead2';
      c.fill();
      inkStroke(c, 3);
      // ホロの斜線（カードの内側だけ）
      rr(c, -70, -98, 140, 196, 12);
      c.clip();
      c.globalAlpha = 0.35;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 6;
      for (let x = -120; x < 120; x += 34) {
        c.beginPath();
        c.moveTo(x, -98);
        c.lineTo(x + 80, 98);
        c.stroke();
      }
      c.restore();
      break;
    }
  }
}
