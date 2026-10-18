export const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR'] as const;
export type Rarity = (typeof RARITIES)[number];

export type RarityInfo = {
  index: number;
  color: number;
  css: string;
  /** 瓶の中のカプセル半径 */
  radius: number;
  /** 景品の基準価格の目安（TODO(balance)） */
  basePrice: number;
  /** 開封前の溜め時間 */
  chargeMs: number;
};

export const RARITY_INFO: Record<Rarity, RarityInfo> = {
  N: { index: 0, color: 0xcfd6dd, css: '#cfd6dd', radius: 30, basePrice: 10, chargeMs: 120 },
  R: { index: 1, color: 0x4fa3ff, css: '#4fa3ff', radius: 33, basePrice: 26, chargeMs: 280 },
  SR: { index: 2, color: 0xb066ff, css: '#b066ff', radius: 36, basePrice: 68, chargeMs: 600 },
  SSR: { index: 3, color: 0xffc531, css: '#ffc531', radius: 39, basePrice: 180, chargeMs: 1000 },
  UR: { index: 4, color: 0xff4f8b, css: '#ff4f8b', radius: 43, basePrice: 480, chargeMs: 1600 },
};

export function nextRarity(r: Rarity): Rarity | null {
  const i = RARITIES.indexOf(r);
  return i < RARITIES.length - 1 ? RARITIES[i + 1] : null;
}

export function rarityAtLeast(r: Rarity, min: Rarity): boolean {
  return RARITY_INFO[r].index >= RARITY_INFO[min].index;
}
