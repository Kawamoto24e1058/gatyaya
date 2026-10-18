// ゲーム状態と保存。Phase 1〜3 は localStorage（必ず try/catch）。
import { BALANCE } from '../config';
import { nextRarity, RARITY_INFO, type Rarity } from '../data/rarity';
import { advanceEvents, initEvents, type EventState } from './events';
import { advanceMarketDay, initMarket, migrateMarket, type MarketState } from './market';
import { runHook } from './relics';

export type DayStats = {
  pulls: number;
  gachaSpent: number;
  sales: number;
  wages: number;
  /** 夜のうちに化けたカプセル数（その日の朝） */
  transforms: number;
  /** 瓶をまぜた回数 */
  shuffles: number;
  /** 色違いを作った回数 */
  fusions: number;
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
  /** jar と同じ並び。true は色違いカプセル */
  jarShiny: boolean[];
  jarCapacityBase: number;
  /** バイト報酬など、その週だけ有効な瓶容量ボーナス */
  jarBonusWeek: number;
  inventory: Record<string, number>;
  market: MarketState;
  events: EventState;
  relics: string[];
  today: DayStats;
  totals: { pulls: number; sales: number; transforms: number; bestRarity: Rarity | null };
  /** 昨夜化けたカプセル（瓶の並び順のインデックス）。朝の演出に使う */
  nightChanges: number[];
  /** 朝のバナーをまだ出していない */
  pendingMorning: boolean;
};

const SAVE_KEY = 'gatyaya.save.v1';
const MUTE_KEY = 'gatyaya.mute';

function freshDay(coins: number): DayStats {
  return { pulls: 0, gachaSpent: 0, sales: 0, wages: 0, transforms: 0, shuffles: 0, fusions: 0, opened: 0, coinsAtStart: coins };
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
    jarShiny: [],
    jarCapacityBase: BALANCE.jarCapacity,
    jarBonusWeek: 0,
    inventory: {},
    market: initMarket(),
    events: initEvents(),
    relics: [],
    today: freshDay(BALANCE.startCoins),
    totals: { pulls: 0, sales: 0, transforms: 0, bestRarity: null },
    nightChanges: [],
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
  return runHook(s, 'onJarCapacity', s.jarCapacityBase + s.jarBonusWeek);
}

/** 縁起物を反映した値 */
export const pullCost = (s: GameState, base: number) => runHook(s, 'onPullCost', base);
export const sellApCost = (s: GameState) => runHook(s, 'onSellApCost', BALANCE.apCost.sell);
export const shufflesPerDay = (s: GameState) => runHook(s, 'onShuffles', BALANCE.shufflesPerDay);

/** 今週の返済額（縁起物で減ることがある） */
export function dueAmount(s: GameState): number {
  return runHook(s, 'onPayday', s.quota);
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
  advanceEvents(s);
  s.today = freshDay(s.coins);
  nightTransform(s);
  s.pendingMorning = true;
  // TODO(Phase 2): 噂（掲示板）・イベントの抽選
}

// TODO(balance): 夜に化ける確率（上位ほど起きにくい）
const NIGHT_CHANCE: Record<Rarity, number> = { N: 0.06, R: 0.05, SR: 0.03, SSR: 0.015, UR: 0 };

/** 開けずに瓶へ残したカプセルが、夜のうちに付喪神になって 1 段階上がる */
function nightTransform(s: GameState): void {
  s.nightChanges = [];
  s.jar.forEach((r, i) => {
    const next = nextRarity(r);
    const chance = runHook(s, 'onNight', NIGHT_CHANCE[r], { rarity: r });
    if (!next || Math.random() >= chance) return;
    s.jar[i] = next;
    s.nightChanges.push(i);
    s.today.transforms += 1;
    s.totals.transforms += 1;
    if (!s.totals.bestRarity || RARITY_INFO[next].index > RARITY_INFO[s.totals.bestRarity].index) s.totals.bestRarity = next;
  });
}

/** 返済。成功なら true */
export function payDebt(s: GameState): boolean {
  const due = dueAmount(s);
  if (s.coins < due) return false;
  s.coins -= due;
  // 繰り延べた分（借金の天才）は翌週のノルマに乗る
  const carry = Math.max(0, s.quota - due);
  s.week += 1;
  s.quota = Math.round(s.quota * BALANCE.quotaGrowth) + carry;
  s.jarBonusWeek = 0;
  return true;
}

export function addRelic(s: GameState, id: string): void {
  if (!s.relics.includes(id)) s.relics.push(id);
  // AP が増える縁起物はその日から効かせる
  const apMax = runHook(s, 'onDayStart', BALANCE.apPerDay);
  if (apMax !== s.apMax) {
    s.ap = Math.max(0, s.ap + (apMax - s.apMax));
    s.apMax = apMax;
  }
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
    // 合体廃止前のセーブを補う
    s.nightChanges ??= [];
    s.events ??= initEvents();
    s.jarShiny ??= s.jar.map(() => false);
    s.today.shuffles ??= 0;
    s.today.fusions ??= 0;
    s.today.transforms ??= 0;
    s.totals.transforms ??= 0;
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
