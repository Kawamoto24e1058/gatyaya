// 縁起物ガチャ：店の奥の暗がりにいる「何か」が回させてくれる。コインで 1 日 1 回。
import { RELICS, type Relic, type RelicRarity } from './relics';
import { dayEvent } from './events';
import type { GameState } from './state';

// TODO(balance)：値段はその週のノルマに比例し（1 週目 150 → 5 週目 2,400）、同じ週に回すたびに倍になる
export const RELIC_GACHA = {
  priceRate: 0.15,
  minPrice: 100,
  weights: { common: 0.62, rare: 0.33, boss: 0.05 } as Record<RelicRarity, number>,
};

export function relicGachaPrice(s: GameState): number {
  const base = Math.max(RELIC_GACHA.minPrice, Math.round((s.quota * RELIC_GACHA.priceRate) / 10) * 10);
  return Math.round(base * 2 ** s.relicGachaWeek * (dayEvent(s)?.relicGacha ?? 1));
}

function pool(s: GameState): Relic[] {
  return RELICS.filter((r) => !s.relics.includes(r.id));
}

/** 回せない理由（回せるなら null） */
export function relicGachaBlocked(s: GameState): string | null {
  if (pool(s).length === 0) return 'もう全部そろっている…';
  if (s.relicGachaDay === s.day) return '今日はもう回した。また明日';
  if (s.coins < relicGachaPrice(s)) return 'コインが足りない';
  return null;
}

/** 代金を払って 1 つ引く。持つかどうかは呼び出し側で決める */
export function pullRelicGacha(s: GameState): Relic | null {
  if (relicGachaBlocked(s)) return null;
  const left = pool(s);
  const rarities = (Object.keys(RELIC_GACHA.weights) as RelicRarity[]).filter((r) => left.some((x) => x.rarity === r));
  const total = rarities.reduce((a, r) => a + RELIC_GACHA.weights[r], 0);
  let t = Math.random() * total;
  let rarity = rarities[rarities.length - 1];
  for (const r of rarities) {
    t -= RELIC_GACHA.weights[r];
    if (t <= 0) {
      rarity = r;
      break;
    }
  }
  const cands = left.filter((x) => x.rarity === rarity);
  s.coins -= relicGachaPrice(s);
  s.relicGachaDay = s.day;
  s.relicGachaWeek += 1;
  return cands[Math.floor(Math.random() * cands.length)];
}
