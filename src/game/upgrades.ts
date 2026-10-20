// 店の改装（アップグレード）：閉店後の夜にコインで店を強化する。効果はその町（ラン）のあいだ続く。
import type { Rarity } from '../data/rarity';
import type { GameState } from './state';

export type UpgradeDef = {
  id: string;
  /** shop：店の改装 ／ machine：ガチャ機の機材 */
  cat: 'shop' | 'machine';
  name: string;
  glyph: string;
  /** レベルごとの説明（index = 次に上がるレベル - 1） */
  levels: { cost: number; text: string }[];
};

// TODO(balance)
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'shelf',
    cat: 'shop',
    name: '瓶の棚を広げる',
    glyph: '瓶',
    levels: [
      { cost: 200, text: '瓶の容量 +4' },
      { cost: 700, text: '瓶の容量 +8' },
      { cost: 2200, text: '瓶の容量 +12' },
    ],
  },
  {
    id: 'twin',
    cat: 'shop',
    name: 'おまけ玉の仕掛け',
    glyph: '玉',
    levels: [
      { cost: 300, text: 'ガチャで 15% の確率でもう 1 個出る' },
      { cost: 1000, text: 'もう 1 個出る確率 30%' },
      { cost: 3000, text: 'もう 1 個出る確率 50%' },
    ],
  },
  {
    id: 'stirrer',
    cat: 'shop',
    name: '自動かき混ぜ機',
    glyph: '撹',
    levels: [
      { cost: 250, text: '瓶をときどき勝手にまぜる・同色が引き合う力 +1' },
      { cost: 900, text: 'まぜる間隔が短くなる・引き合う力 +2' },
      { cost: 2500, text: 'さらに短く・引き合う力 +3' },
    ],
  },
  {
    id: 'regular',
    cat: 'shop',
    name: 'バイト先の顔なじみ',
    glyph: '顔',
    levels: [
      { cost: 200, text: 'バイト代 +15%' },
      { cost: 700, text: 'バイト代 +30%' },
      { cost: 2000, text: 'バイト代 +50%' },
    ],
  },
  {
    id: 'stall',
    cat: 'shop',
    name: '常設の屋台',
    glyph: '屋',
    levels: [{ cost: 1800, text: '売りに行くのに AP がいらなくなる' }],
  },
  {
    id: 'lantern',
    cat: 'shop',
    name: '提灯を増やす',
    glyph: '灯',
    levels: [
      { cost: 1500, text: '毎日の提灯（AP）+1' },
      { cost: 6000, text: '毎日の提灯（AP）+2' },
    ],
  },
  // ---- ガチャ機の機材 ----
  {
    id: 'rapid',
    cat: 'machine',
    name: '連射ハンドル',
    glyph: '連',
    levels: [
      { cost: 400, text: 'ハンドル 1 回転で 2 個出る（代金は個数分）' },
      { cost: 1500, text: 'ハンドル 1 回転で 3 個出る' },
    ],
  },
  {
    id: 'supplier',
    cat: 'machine',
    name: '仕入れ先の格上げ',
    glyph: '仕',
    levels: [
      { cost: 800, text: 'N が減って R 以上が出やすくなる（N 72→67%）' },
      { cost: 3000, text: 'さらに R 以上が出やすくなる（N →62%）' },
      { cost: 9000, text: 'もっと R 以上が出やすくなる（N →57%）' },
    ],
  },
  {
    id: 'pricegun',
    cat: 'machine',
    name: '値札機',
    glyph: '札',
    levels: [{ cost: 300, text: '売り場の在庫に今日の値段を表示する' }],
  },
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upgradeLevel(s: GameState, id: string): number {
  return s.upgrades[id] ?? 0;
}

/** 次のレベルの代金（もう上がらないなら null） */
export function nextUpgradeCost(s: GameState, id: string): number | null {
  const lv = upgradeLevel(s, id);
  return UPGRADE_BY_ID[id].levels[lv]?.cost ?? null;
}

export function buyUpgrade(s: GameState, id: string): boolean {
  const cost = nextUpgradeCost(s, id);
  if (cost === null || s.coins < cost) return false;
  s.coins -= cost;
  s.upgrades[id] = upgradeLevel(s, id) + 1;
  return true;
}

// ---- 効果（ゲーム側から読む） ----
export const upJarBonus = (s: GameState) => upgradeLevel(s, 'shelf') * 4;
export const upTwinChance = (s: GameState) => [0, 0.15, 0.3, 0.5][upgradeLevel(s, 'twin')];
/** 自動でまぜる間隔（秒）。0 は無し */
export const upStirInterval = (s: GameState) => [0, 7, 4.5, 2.8][upgradeLevel(s, 'stirrer')];
export const upAttract = (s: GameState) => upgradeLevel(s, 'stirrer');
export const upBaitoMult = (s: GameState) => [1, 1.15, 1.3, 1.5][upgradeLevel(s, 'regular')];
export const upFreeStall = (s: GameState) => upgradeLevel(s, 'stall') > 0;
export const upApBonus = (s: GameState) => upgradeLevel(s, 'lantern');
/** 1 回転で出る個数 */
export const upRapid = (s: GameState) => 1 + upgradeLevel(s, 'rapid');
export const upPriceGun = (s: GameState) => upgradeLevel(s, 'pricegun') > 0;

/** 仕入れ先の格上げを反映した排出率（レベルごとに N を減らして R 以上へ回す） */
export function upRarityWeights(s: GameState, base: Record<Rarity, number>): Record<Rarity, number> {
  const k = upgradeLevel(s, 'supplier');
  if (k === 0) return base;
  return {
    N: Math.max(1, base.N - 5 * k),
    R: base.R + 3.5 * k,
    SR: base.SR + 1.2 * k,
    SSR: base.SSR + 0.25 * k,
    UR: base.UR + 0.05 * k,
  };
}
