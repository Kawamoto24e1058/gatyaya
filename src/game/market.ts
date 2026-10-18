// 相場。Phase 1 はトレンド係数と飽和係数のみ。
// 売値 = basePrice × トレンド係数 × イベント係数 × 飽和係数 × レリック補正
import { BALANCE } from '../config';
import { PRIZE_BY_ID, SERIES } from '../data/prizes';
import { clamp, gauss } from '../core/util';
import { runHook } from './relics';
import type { GameState } from './state';

export type TrendMode = 'normal' | 'boom' | 'bored';

export type SeriesMarket = {
  trend: number;
  prevTrend: number;
  mode: TrendMode;
  modeDays: number;
};

export type MarketState = {
  series: Record<string, SeriesMarket>;
  /** 景品ごとの飽和係数（1.0 が平常） */
  saturation: Record<string, number>;
};

export function initMarket(): MarketState {
  const series: Record<string, SeriesMarket> = {};
  for (const s of SERIES) {
    const t = Math.exp(gauss() * 0.15);
    series[s.id] = { trend: t, prevTrend: t, mode: 'normal', modeDays: 0 };
  }
  return { series, saturation: {} };
}

// TODO(balance): 状態遷移確率・ドリフト量は仮値
function nextMode(sm: SeriesMarket): TrendMode {
  const r = Math.random();
  switch (sm.mode) {
    case 'normal':
      if (r < 0.12) return 'boom';
      if (r < 0.24) return 'bored';
      return 'normal';
    case 'boom':
      if (sm.modeDays < 2) return 'boom';
      if (r < 0.15) return 'bored'; // ブームの反動で飽きる
      if (r < 0.5) return 'normal';
      return 'boom';
    case 'bored':
      if (sm.modeDays < 2) return 'bored';
      if (r < 0.35) return 'normal';
      return 'bored';
  }
}

/** 朝に 1 回呼ぶ：トレンドのランダムウォークと飽和の回復 */
export function advanceMarketDay(m: MarketState): void {
  for (const id of Object.keys(m.series)) {
    const sm = m.series[id];
    const mode = nextMode(sm);
    sm.modeDays = mode === sm.mode ? sm.modeDays + 1 : 0;
    sm.mode = mode;
    const logT = Math.log(sm.trend);
    const drift = mode === 'boom' ? 0.2 : mode === 'bored' ? -0.15 : -0.25 * logT; // 通常時は 1.0 に引き戻す
    sm.prevTrend = sm.trend;
    sm.trend = clamp(Math.exp(logT + drift + gauss() * 0.1), BALANCE.trendMin, BALANCE.trendMax);
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
  const p = PRIZE_BY_ID[prizeId];
  const trend = state.market.series[p.seriesId].trend;
  const event = 1; // TODO(Phase 2): イベント係数（TV紹介・生産終了・偽物・販売禁止）
  const sat = satOverride ?? saturationOf(state.market, prizeId);
  const v = p.basePrice * trend * event * sat;
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
  if (r > 1.03) return 'up';
  if (r < 0.97) return 'down';
  return 'flat';
}

/** 1 秒でわかる記号表示（↑ ↓ → 🔥）。🚫 は Phase 2 の販売禁止で使う */
export function trendIcon(sm: SeriesMarket): string {
  const arrow = { up: '↑', down: '↓', flat: '→' }[trendSign(sm)];
  return sm.mode === 'boom' ? `🔥${arrow}` : arrow;
}
