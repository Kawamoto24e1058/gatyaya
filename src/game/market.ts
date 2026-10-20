// 相場。Phase 1 はトレンド係数と飽和係数のみ。
// 売値 = basePrice × トレンド係数 × イベント係数 × 飽和係数 × レリック補正
import { BALANCE } from '../config';
import { parseStock, SERIES, SHINY_MULT } from '../data/prizes';
import { rarityAtLeast, type Rarity } from '../data/rarity';
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

/** お客の注文：その日だけ、決まったシリーズの○○以上を高く買ってくれる（先着 left 個まで） */
export type Order = { seriesId: string; minRarity: Rarity; mult: number; left: number };

export type MarketState = {
  series: Record<string, SeriesMarket>;
  /** 景品ごとの飽和係数（1.0 が平常） */
  saturation: Record<string, number>;
  /** 今日の注文（なければ null） */
  order: Order | null;
};

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));

// TODO(balance): パターンの出現率と倍率は仮値。
// 安い日は ×0.4 前後まで沈み、高い日は ×2〜×6 まで跳ねる（どう森のカブ）。
// 「毎日ぜんぶ売る」より「安い日は持って高い日に売る」が得になるよう、谷を深く・山を高くしている。
const PATTERN_WEIGHTS: Record<WeekPattern, number> = { wave: 0.3, ripple: 0.32, slump: 0.16, chaos: 0.22 };

function pickPattern(): WeekPattern {
  let r = Math.random();
  for (const [k, w] of Object.entries(PATTERN_WEIGHTS) as [WeekPattern, number][]) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'chaos';
}

/** じわじわ下がる区間 */
function decline(start: number, days: number, out: number[], step: [number, number] = [0.06, 0.12]) {
  let v = start;
  for (let i = 0; i < days; i++) {
    out.push(v);
    v -= rand(step[0], step[1]);
  }
}

export function makeCurve(p: WeekPattern): number[] {
  const c: number[] = [];
  switch (p) {
    case 'wave': {
      // 跳ね上がり開始日。ピークは開始の 2 日後（週内に収まるように）
      const s = randInt(1, 4);
      decline(rand(0.75, 0.9), s, c);
      c.push(rand(1.0, 1.5), rand(1.6, 2.4), rand(2.5, 6.0), rand(1.4, 2.2), rand(0.8, 1.2));
      while (c.length < 7) c.push(rand(0.35, 0.6));
      break;
    }
    case 'ripple': {
      const s = randInt(1, 3);
      decline(rand(0.75, 0.9), s, c);
      const peak = rand(1.8, 3.0);
      c.push(rand(0.9, 1.3), rand(1.2, 1.7), rand(1.5, peak), peak);
      decline(rand(0.7, 0.9), 7 - c.length, c);
      break;
    }
    case 'slump':
      decline(rand(0.8, 0.9), 7, c, [0.06, 0.1]);
      break;
    case 'chaos':
      for (let i = 0; i < 7; i++) c.push(Math.random() < 0.3 ? rand(0.4, 0.65) : Math.random() < 0.2 ? rand(1.6, 2.4) : rand(0.8, 1.3));
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
  return { series, saturation: {}, order: rollOrder() };
}

/** 旧セーブ（パターン導入前）を読み込んだときに補う */
export function migrateMarket(m: MarketState, day: number): void {
  if (m.order === undefined) m.order = rollOrder();
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
  m.order = rollOrder();
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
// TODO(balance)：注文の出方
const ORDER_CHANCE = 0.75;
const ORDER_RARITY: [Rarity, number][] = [
  ['R', 0.5],
  ['SR', 0.35],
  ['SSR', 0.15],
];

export function rollOrder(): Order | null {
  if (Math.random() > ORDER_CHANCE) return null;
  let r = Math.random();
  let minRarity: Rarity = 'R';
  for (const [k, w] of ORDER_RARITY) {
    r -= w;
    if (r <= 0) {
      minRarity = k;
      break;
    }
  }
  const series = SERIES[Math.floor(Math.random() * SERIES.length)];
  return { seriesId: series.id, minRarity, mult: Math.round(rand(1.8, 2.6) * 10) / 10, left: 3 };
}

/** この景品が今日の注文に当てはまるか（残りがあるときだけ） */
export function matchesOrder(state: GameState, prizeId: string): boolean {
  const o = state.market.order;
  if (!o || o.left <= 0) return false;
  const { prize } = parseStock(prizeId);
  return prize.seriesId === o.seriesId && rarityAtLeast(prize.rarity, o.minRarity);
}

function rawPrice(state: GameState, prizeId: string, satOverride?: number, ignoreOrder = false): number {
  const { prize: p, shiny } = parseStock(prizeId);
  const trend = state.market.series[p.seriesId].trend;
  const event = eventMult(state, p.seriesId);
  const sat = satOverride ?? saturationOf(state.market, prizeId);
  const order = !ignoreOrder && matchesOrder(state, prizeId) ? state.market.order!.mult : 1;
  const v = p.basePrice * (shiny ? SHINY_MULT : 1) * trend * event * sat * order * (1 + (state.sellBonusWeek ?? 0));
  return runHook(state, 'onSellPrice', v, { prizeId });
}

/**
 * 1 個売るごとの値崩れ（飽和）の掛け率。人気の日（トレンドが高い）は崩れにくく、
 * 不人気の日にまとめて売ると大きく崩れる（安い日の投げ売りより、高い日のまとめ売りが得になるように）。
 */
export function saturationStep(state: GameState, prizeId: string): number {
  const trend = state.market.series[parseStock(prizeId).prize.seriesId].trend;
  return 1 - (1 - BALANCE.saturationPerSale) / clamp(trend, 0.5, 4);
}

export function sellPrice(state: GameState, prizeId: string): number {
  return Math.max(1, Math.round(rawPrice(state, prizeId)));
}

/** n 個まとめて売ったときの合計（値崩れ込み）の見積もり */
export function estimateSellTotal(state: GameState, prizeId: string, n: number): number {
  let sat = saturationOf(state.market, prizeId);
  let total = 0;
  let orderLeft = matchesOrder(state, prizeId) ? state.market.order!.left : 0;
  for (let i = 0; i < n; i++) {
    total += Math.max(1, Math.round(rawPrice(state, prizeId, sat, orderLeft <= 0)));
    orderLeft -= 1;
    sat *= saturationStep(state, prizeId);
  }
  return total;
}

/** 1 個売る。所持数・飽和・コインを更新し、売値を返す */
// TODO(balance)：太客（言い値で買うお客）。まれに 1 個の売値が何倍にもなる
export const BIG_SPENDER_RATE = 0.015;
const bigSpenderMult = () => Math.round(4 + Math.random() * 4);

/** 売った結果。bigSpender は太客が付いたときの倍率 */
export type SaleResult = { price: number; bigSpender?: number };

export function sellOne(state: GameState, prizeId: string): number {
  return sellOneEx(state, prizeId).price;
}

export function sellOneEx(state: GameState, prizeId: string): SaleResult {
  const have = state.inventory[prizeId] ?? 0;
  if (have <= 0) return { price: 0 };
  // 販売禁止中は表では売れない（闇ルートは sellDark）
  if (isBanned(state, parseStock(prizeId).prize.seriesId)) return { price: 0 };
  const big = Math.random() < BIG_SPENDER_RATE ? bigSpenderMult() : undefined;
  const price = sellPrice(state, prizeId) * (big ?? 1);
  if (matchesOrder(state, prizeId)) state.market.order!.left -= 1;
  state.inventory[prizeId] = have - 1;
  if (state.inventory[prizeId] <= 0) delete state.inventory[prizeId];
  state.market.saturation[prizeId] = saturationOf(state.market, prizeId) * saturationStep(state, prizeId);
  state.coins += price;
  state.today.sales += price;
  state.totals.sales += price;
  return { price, bigSpender: big };
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
  state.market.saturation[key] = saturationOf(state.market, key) * saturationStep(state, key);
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
