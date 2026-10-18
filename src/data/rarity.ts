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
  N: { index: 0, color: 0xd8d0be, css: '#d8d0be', radius: 30, basePrice: 10, chargeMs: 120 },
  R: { index: 1, color: 0x5b8fc9, css: '#5b8fc9', radius: 33, basePrice: 26, chargeMs: 280 },
  SR: { index: 2, color: 0x9b6bc4, css: '#9b6bc4', radius: 36, basePrice: 68, chargeMs: 600 },
  SSR: { index: 3, color: 0xe3a53a, css: '#e3a53a', radius: 39, basePrice: 180, chargeMs: 1000 },
  UR: { index: 4, color: 0xd94b6a, css: '#d94b6a', radius: 43, basePrice: 480, chargeMs: 1600 },
};

export function nextRarity(r: Rarity): Rarity | null {
  const i = RARITIES.indexOf(r);
  return i < RARITIES.length - 1 ? RARITIES[i + 1] : null;
}

export function rarityAtLeast(r: Rarity, min: Rarity): boolean {
  return RARITY_INFO[r].index >= RARITY_INFO[min].index;
}
