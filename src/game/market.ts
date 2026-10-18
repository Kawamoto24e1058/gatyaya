// 相場。Phase 1 はトレンド係数と飽和係数のみ。
// 売値 = basePrice × トレンド係数 × イベント係数 × 飽和係数 × レリック補正
import { BALANCE } from '../config';
import { parseStock, SERIES, SHINY_MULT } from '../data/prizes';
import { clamp } from '../core/util';
import { DARK_CATCH_RATE, DARK_FINE_RATE, DARK_PRICE_RATE, eventMult, isBanned } from './events';
import { runHook } from './relics';
import type { GameState } from './state';

export type TrendMode = 'normal' | 'boom' | 'bored';

/**
 * 週ごとの値動きパターン（プレイヤーには非公開。Phase 2 の噂でヒントを出す想定）。
 * - wave   : 大波。じわじわ下がったあと、ある日 ×2〜×6 に跳ね上がり、すぐ暴落する
 * - ripple : 小波。下がってから ×1.4〜×2.5 程度まで上がる
 * - slump  : じり貧。週を通して下がり続ける
 * - chaos  : 乱高下。毎日 ×0.6〜×1.5 で上下する
 */
export type WeekPattern = 'wave' | 'ripple' | 'slump' | 'chaos';

export type SeriesMarket = {
  trend: number;
  prevTrend: number;
  /** 表示用（trend から決まる） */
  mode: TrendMode;
  pattern: WeekPattern;
  /** その週 7 日分の倍率 */
  curve: number[];
  /** 今日が週の何日目か（0 始まり） */
  dayIdx: number;
};

export type MarketState = {
  series: Record<string, SeriesMarket>;
  /** 景品ごとの飽和係数（1.0 が平常） */
  saturation: Record<string, number>;
};

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));

// TODO(balance): パターンの出現率と倍率は仮値
const PATTERN_WEIGHTS: Record<WeekPattern, number> = { wave: 0.22, ripple: 0.28, slump: 0.18, chaos: 0.32 };

function pickPattern(): WeekPattern {
  let r = Math.random();
  for (const [k, w] of Object.entries(PATTERN_WEIGHTS) as [WeekPattern, number][]) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'chaos';
}

/** じわじわ下がる区間 */
function decline(start: number, days: number, out: number[]) {
  let v = start;
  for (let i = 0; i < days; i++) {
    out.push(v);
    v -= rand(0.03, 0.08);
  }
}

export function makeCurve(p: WeekPattern): number[] {
  const c: number[] = [];
  switch (p) {
    case 'wave': {
      // 跳ね上がり開始日。ピークは開始の 2 日後（週内に収まるように）
      const s = randInt(1, 4);
      decline(rand(0.85, 0.95), s, c);
      c.push(rand(0.9, 1.4), rand(1.4, 2.0), rand(2.0, 6.0), rand(1.4, 2.0), rand(0.9, 1.4));
      while (c.length < 7) c.push(rand(0.4, 0.9));
      break;
    }
    case 'ripple': {
      const s = randInt(1, 3);
      decline(rand(0.85, 0.95), s, c);
      const peak = rand(1.4, 2.5);
      c.push(rand(0.9, 1.4), rand(0.9, 1.4), rand(1.4, peak), peak);
      decline(rand(0.8, 1.0), 7 - c.length, c);
      break;
    }
    case 'slump':
      decline(rand(0.85, 0.95), 7, c);
      break;
    case 'chaos':
      for (let i = 0; i < 7; i++) c.push(Math.random() < 0.25 ? rand(0.5, 0.75) : rand(0.8, 1.5));
      break;
  }
  return c.slice(0, 7).map((v) => clamp(v, BALANCE.trendMin, BALANCE.trendMax));
}

function modeOf(trend: number): TrendMode {
  return trend >= 1.8 ? 'boom' : trend <= 0.6 ? 'bored' : 'normal';
}

function newWeek(prevTrend: number): SeriesMarket {
  const pattern = pickPattern();
  const curve = makeCurve(pattern);
  return { trend: curve[0], prevTrend, mode: modeOf(curve[0]), pattern, curve, dayIdx: 0 };
}

export function initMarket(): MarketState {
  const series: Record<string, SeriesMarket> = {};
  for (const s of SERIES) series[s.id] = newWeek(1);
  return { series, saturation: {} };
}

/** 旧セーブ（パターン導入前）を読み込んだときに補う */
export function migrateMarket(m: MarketState, day: number): void {
  for (const s of SERIES) {
    const sm = m.series[s.id] as SeriesMarket | undefined;
    if (!sm || !Array.isArray(sm.curve)) {
      const fresh = newWeek(sm?.trend ?? 1);
      const idx = (day - 1) % BALANCE.daysPerWeek;
      fresh.dayIdx = idx;
      fresh.trend = fresh.curve[idx];
      fresh.mode = modeOf(fresh.trend);
      m.series[s.id] = fresh;
    }
  }
}

/** 朝に 1 回呼ぶ（day は新しい日）：週の頭なら新パターンを抽選し、その日の倍率にする */
export function advanceMarketDay(m: MarketState, day: number): void {
  const idx = (day - 1) % BALANCE.daysPerWeek;
  for (const id of Object.keys(m.series)) {
    const old = m.series[id];
    const sm = idx === 0 ? newWeek(old.trend) : old;
    sm.prevTrend = old.trend;
    sm.dayIdx = idx;
    sm.trend = sm.curve[idx];
    sm.mode = modeOf(sm.trend);
    m.series[id] = sm;
  }
  for (const id of Object.keys(m.saturation)) {
    const s = m.saturation[id];
    const ns = s + (1 - s) * BALANCE.saturationRecovery;
    if (ns > 0.995) delete m.saturation[id];
    else m.saturation[id] = ns;
  }
}

export function saturationOf(m: MarketState, prizeId: string): number {
  return m.saturation[prizeId] ?? 1;
}

/** 1 個あたりの現在の売値（小数を含む生値） */
function rawPrice(state: GameState, prizeId: string, satOverride?: number): number {
  const { prize: p, shiny } = parseStock(prizeId);
  const trend = state.market.series[p.seriesId].trend;
  const event = eventMult(state, p.seriesId);
  const sat = satOverride ?? saturationOf(state.market, prizeId);
  const v = p.basePrice * (shiny ? SHINY_MULT : 1) * trend * event * sat * (1 + (state.sellBonusWeek ?? 0));
  return runHook(state, 'onSellPrice', v, { prizeId });
}

export function sellPrice(state: GameState, prizeId: string): number {
  return Math.max(1, Math.round(rawPrice(state, prizeId)));
}

/** n 個まとめて売ったときの合計（値崩れ込み）の見積もり */
export function estimateSellTotal(state: GameState, prizeId: string, n: number): number {
  let sat = saturationOf(state.market, prizeId);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Math.max(1, Math.round(rawPrice(state, prizeId, sat)));
    sat *= BALANCE.saturationPerSale;
  }
  return total;
}

/** 1 個売る。所持数・飽和・コインを更新し、売値を返す */
export function sellOne(state: GameState, prizeId: string): number {
  const have = state.inventory[prizeId] ?? 0;
  if (have <= 0) return 0;
  // 販売禁止中は表では売れない（闇ルートは sellDark）
  if (isBanned(state, parseStock(prizeId).prize.seriesId)) return 0;
  const price = sellPrice(state, prizeId);
  state.inventory[prizeId] = have - 1;
  if (state.inventory[prizeId] <= 0) delete state.inventory[prizeId];
  state.market.saturation[prizeId] = saturationOf(state.market, prizeId) * BALANCE.saturationPerSale;
  state.coins += price;
  state.today.sales += price;
  state.totals.sales += price;
  return price;
}

export type TrendSign = 'up' | 'down' | 'flat';

export function trendSign(sm: SeriesMarket): TrendSign {
  const r = sm.trend / sm.prevTrend;
  if (r > 1.05) return 'up';
  if (r < 0.95) return 'down';
  return 'flat';
}

/** 1 秒でわかる記号表示（↑ ↓ → 🔥）。🚫 は Phase 2 の販売禁止で使う */
export function trendIcon(sm: SeriesMarket): string {
  const arrow = { up: '↑', down: '↓', flat: '→' }[trendSign(sm)];
  return sm.mode === 'boom' ? `🔥${arrow}` : arrow;
}

export function canSell(state: GameState, key: string): boolean {
  return !isBanned(state, parseStock(key).prize.seriesId);
}

export function darkPrice(state: GameState, key: string): number {
  return Math.max(1, Math.round(rawPrice(state, key) * DARK_PRICE_RATE));
}

/** 闇ルートで 1 個売る。摘発されたら売上は没収、さらに罰金 */
export function sellDark(state: GameState, key: string): { earned: number; caught: boolean; fine: number } {
  const have = state.inventory[key] ?? 0;
  if (have <= 0) return { earned: 0, caught: false, fine: 0 };
  const price = darkPrice(state, key);
  state.inventory[key] = have - 1;
  if (state.inventory[key] <= 0) delete state.inventory[key];
  state.market.saturation[key] = saturationOf(state.market, key) * BALANCE.saturationPerSale;
  const catchRate = runHook(state, 'onDarkCatch', DARK_CATCH_RATE);
  if (Math.random() < catchRate) {
    const fine = Math.min(state.coins, price * DARK_FINE_RATE);
    state.coins -= fine;
    return { earned: 0, caught: true, fine };
  }
  state.coins += price;
  state.today.sales += price;
  state.totals.sales += price;
  return { earned: price, caught: false, fine: 0 };
}
