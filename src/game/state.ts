// ゲーム状態と保存。Phase 1〜3 は localStorage（必ず try/catch）。
import { BALANCE } from '../config';
import type { Rarity } from '../data/rarity';
import { advanceMarketDay, initMarket, migrateMarket, type MarketState } from './market';
import { runHook } from './relics';

export type DayStats = {
  pulls: number;
  gachaSpent: number;
  sales: number;
  wages: number;
  merges: number;
  opened: number;
  coinsAtStart: number;
};

export type GameState = {
  version: 1;
  day: number; // 1 始まり
  week: number; // 1 始まり
  coins: number;
  ap: number;
  apMax: number;
  quota: number;
  machineId: string;
  /** 瓶の中のカプセル（位置は保存しない。再開時は上から降らせる） */
  jar: Rarity[];
  jarCapacityBase: number;
  /** バイト報酬など、その週だけ有効な瓶容量ボーナス */
  jarBonusWeek: number;
  inventory: Record<string, number>;
  market: MarketState;
  relics: string[];
  today: DayStats;
  totals: { pulls: number; sales: number; merges: number; bestRarity: Rarity | null };
  /** 朝のバナーをまだ出していない */
  pendingMorning: boolean;
};

const SAVE_KEY = 'gatyaya.save.v1';
const MUTE_KEY = 'gatyaya.mute';

function freshDay(coins: number): DayStats {
  return { pulls: 0, gachaSpent: 0, sales: 0, wages: 0, merges: 0, opened: 0, coinsAtStart: coins };
}

export function newGame(): GameState {
  return {
    version: 1,
    day: 1,
    week: 1,
    coins: BALANCE.startCoins,
    ap: BALANCE.apPerDay,
    apMax: BALANCE.apPerDay,
    quota: BALANCE.firstQuota,
    machineId: 'hand',
    jar: [],
    jarCapacityBase: BALANCE.jarCapacity,
    jarBonusWeek: 0,
    inventory: {},
    market: initMarket(),
    relics: [],
    today: freshDay(BALANCE.startCoins),
    totals: { pulls: 0, sales: 0, merges: 0, bestRarity: null },
    pendingMorning: true,
  };
}

let current: GameState = newGame();
/** タイトル画面の仮状態でセーブを上書きしないよう、開始/再開するまで保存しない */
let active = false;

export function S(): GameState {
  return current;
}

export function setState(s: GameState): void {
  current = s;
  active = true;
}

export function jarCapacity(s: GameState): number {
  return s.jarCapacityBase + s.jarBonusWeek;
}

export function inventoryCount(s: GameState): number {
  return Object.values(s.inventory).reduce((a, b) => a + b, 0);
}

export function daysUntilPayday(s: GameState): number {
  const r = s.day % BALANCE.daysPerWeek;
  return r === 0 ? 0 : BALANCE.daysPerWeek - r;
}

export function isPayday(s: GameState): boolean {
  return s.day % BALANCE.daysPerWeek === 0;
}

/** 閉店後に翌日へ進める（返済処理は PaydayScene 側で先に済ませる） */
export function advanceDay(s: GameState): void {
  s.day += 1;
  s.apMax = runHook(s, 'onDayStart', BALANCE.apPerDay);
  s.ap = s.apMax;
  advanceMarketDay(s.market, s.day);
  s.today = freshDay(s.coins);
  s.pendingMorning = true;
  // TODO(Phase 2): 噂（掲示板）・イベントの抽選
}

/** 返済。成功なら true */
export function payDebt(s: GameState): boolean {
  const quota = runHook(s, 'onPayday', s.quota);
  if (s.coins < quota) return false;
  s.coins -= quota;
  s.week += 1;
  s.quota = Math.round(s.quota * BALANCE.quotaGrowth);
  s.jarBonusWeek = 0;
  // TODO(Phase 2): 返済後にレリックショップ（3 つから 1 つ）
  return true;
}

// ---- 保存 ----

let saveTimer: number | undefined;

export function saveNow(): void {
  if (!active) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(current));
  } catch {
    /* 容量超過・プライベートモードなどは無視 */
  }
}

/** 頻繁に呼ばれても書き込みは間引く */
export function save(): void {
  if (saveTimer !== undefined) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    saveNow();
  }, 400);
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1) return null;
    migrateMarket(s.market, s.day);
    return s;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  active = false;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* noop */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function storeMuted(m: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* noop */
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
}
