// 周回をまたいで残る記録と、ガチャ機の解禁。セーブ（1 回のラン）とは別に保存する。
import { RARITY_INFO, type Rarity } from '../data/rarity';

const META_KEY = 'gatyaya.meta.v1';

export type Meta = {
  /** これまでに回した回数（全ラン合計） */
  lifetimePulls: number;
  /** たどり着いた最高の週 */
  bestWeek: number;
  /** 引いた最高のレア度 */
  bestRarity: Rarity | null;
  /** 町の借金を完済した回数 */
  clears: number;
  /** 解禁済みのガチャ機 */
  unlocked: string[];
};

export type UnlockDef = {
  machineId: string;
  /** 解禁条件の説明 */
  text: string;
  /** 進み具合（例：「あと 37 回」）。満たしていれば null */
  progress: (m: Meta) => string | null;
};

// TODO(balance)：解禁条件
export const UNLOCKS: UnlockDef[] = [
  { machineId: 'triple', text: '累計 150 回ガチャを回す', progress: (m) => (m.lifetimePulls >= 150 ? null : `あと ${150 - m.lifetimePulls} 回`) },
  { machineId: 'obake', text: '第 3 週までたどり着く', progress: (m) => (m.bestWeek >= 3 ? null : `最高 第 ${m.bestWeek} 週`) },
  { machineId: 'kin', text: 'SSR 以上を 1 回引く', progress: (m) => (m.bestRarity && RARITY_INFO[m.bestRarity].index >= 3 ? null : 'まだ引いていない') },
  { machineId: 'yami', text: '町の借金を完済する', progress: (m) => (m.clears >= 1 ? null : 'まだ完済していない') },
];

function fresh(): Meta {
  return { lifetimePulls: 0, bestWeek: 1, bestRarity: null, clears: 0, unlocked: ['hand'] };
}

let meta: Meta | null = null;

export function getMeta(): Meta {
  if (meta) return meta;
  meta = fresh();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(META_KEY) : null;
    if (raw) meta = { ...fresh(), ...(JSON.parse(raw) as Partial<Meta>) };
  } catch {
    /* 読めなければ新しく始める */
  }
  return meta;
}

function saveMeta() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(META_KEY, JSON.stringify(getMeta()));
  } catch {
    /* noop */
  }
}

/** 条件を満たしたガチャ機を解禁する。新しく解禁された id を返す */
function checkUnlocks(): string[] {
  const m = getMeta();
  const fresh: string[] = [];
  for (const u of UNLOCKS) {
    if (!m.unlocked.includes(u.machineId) && u.progress(m) === null) {
      m.unlocked.push(u.machineId);
      fresh.push(u.machineId);
    }
  }
  saveMeta();
  return fresh;
}

export function isUnlocked(id: string): boolean {
  return getMeta().unlocked.includes(id);
}

export function recordPulls(n: number): string[] {
  getMeta().lifetimePulls += n;
  return checkUnlocks();
}

export function recordRarity(r: Rarity): string[] {
  const m = getMeta();
  if (!m.bestRarity || RARITY_INFO[r].index > RARITY_INFO[m.bestRarity].index) m.bestRarity = r;
  return checkUnlocks();
}

export function recordWeek(week: number): string[] {
  const m = getMeta();
  m.bestWeek = Math.max(m.bestWeek, week);
  return checkUnlocks();
}

export function recordClear(): string[] {
  getMeta().clears += 1;
  return checkUnlocks();
}
