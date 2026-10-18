// 景品はすべて架空のシリーズ。実在の商品名・ブランド・キャラクターは使わない。
import { RARITY_INFO, type Rarity } from './rarity';

export type Prize = {
  id: string;
  name: string;
  seriesId: string;
  rarity: Rarity;
  basePrice: number;
};

export type Series = {
  id: string;
  name: string;
  color: string;
};

export const SERIES: Series[] = [
  { id: 'mochi', name: 'もちもち惑星', color: '#ff8fb1' },
  { id: 'neji', name: 'ネジネジ工房', color: '#5ec8ff' },
  { id: 'obake', name: 'おばけ商店街', color: '#a98cff' },
];

// シリーズ × レア度ごとに 2 種
const NAMES: Record<string, Record<Rarity, [string, string]>> = {
  mochi: {
    N: ['きなこ星', 'あんこ星'],
    R: ['ずんだ衛星', 'みたらし彗星'],
    SR: ['さくら土星', 'わらび銀河'],
    SSR: ['大福ブラックホール', 'ういろう超新星'],
    UR: ['黄金もち宇宙', '虹色おはぎ星雲'],
  },
  neji: {
    N: ['ちびナット', 'はぐれボルト'],
    R: ['ゼンマイ犬', 'ばね蛙'],
    SR: ['歯車フクロウ', 'ブリキ鯨'],
    SSR: ['蒸気ドラゴン', '真鍮の騎士'],
    UR: ['永久機関くん', '時計塔の主'],
  },
  obake: {
    N: ['ちょうちん小僧', 'からかさ見習い'],
    R: ['のれん坊', 'そろばん狐'],
    SR: ['番台ねこまた', 'ろくろ首の店番'],
    SSR: ['夜市の大入道', '千両箱の精'],
    UR: ['百鬼夜行の大売出し', '福招きの座敷わらし'],
  },
};

// シリーズごとの価格の癖（TODO(balance)）
const SERIES_PRICE_BIAS: Record<string, number> = { mochi: 1.0, neji: 1.1, obake: 0.9 };

export const PRIZES: Prize[] = SERIES.flatMap((s) =>
  (Object.keys(NAMES[s.id]) as Rarity[]).flatMap((r) =>
    NAMES[s.id][r].map((name, k) => ({
      id: `${s.id}_${r}_${k}`,
      name,
      seriesId: s.id,
      rarity: r,
      basePrice: Math.round(RARITY_INFO[r].basePrice * SERIES_PRICE_BIAS[s.id] * (k === 0 ? 0.9 : 1.1)),
    })),
  ),
);

export const PRIZE_BY_ID: Record<string, Prize> = Object.fromEntries(PRIZES.map((p) => [p.id, p]));
export const SERIES_BY_ID: Record<string, Series> = Object.fromEntries(SERIES.map((s) => [s.id, s]));

export function prizesOf(seriesId: string, rarity: Rarity): Prize[] {
  return PRIZES.filter((p) => p.seriesId === seriesId && p.rarity === rarity);
}
