// イベント（仕様書 4.3）と噂（4.4）。データ定義で種類を追加できる。
// 噂は数日後のイベントの予兆か、今週の値動きのヒント。的中率は約 6 割（縁起物で上がる）。
// 販売禁止だけは必ず本物の噂で予兆を出す（理不尽さを避けるため）。
import { SERIES, SERIES_BY_ID } from '../data/prizes';
import { pick } from '../core/util';
import { runHook } from './relics';
import type { GameState } from './state';

export type EventType = 'tv' | 'discontinued' | 'fake' | 'ban';

export type EventDef = {
  type: EventType;
  name: string;
  /** 黒板に出す記号 */
  icon: string;
  /** 続く日数（Infinity はそのラン中ずっと） */
  days: number;
  /** 売値の倍率（ban は売れない） */
  mult: () => number;
  /** 起きる重み */
  weight: number;
  /** 噂の文面（本物・ガセ共通） */
  rumor: (series: string) => string;
  /** 起きた日の告知 */
  news: (series: string) => string;
};

// TODO(balance)：倍率・期間・頻度は仮値
export const EVENT_DEFS: Record<EventType, EventDef> = {
  tv: {
    type: 'tv',
    name: 'TVで紹介',
    icon: '📺',
    days: 2,
    mult: () => 1.8 + Math.random() * 0.8,
    weight: 3,
    rumor: (s) => `「${s}」がテレビに出るらしい`,
    news: (s) => `📺 ${s}がテレビで紹介された！`,
  },
  discontinued: {
    type: 'discontinued',
    name: '生産終了',
    icon: '🏭',
    days: Infinity,
    mult: () => 1.4,
    weight: 1,
    rumor: (s) => `「${s}」が生産終了になるって話だ`,
    news: (s) => `🏭 ${s}が生産終了！ もう出にくい`,
  },
  fake: {
    type: 'fake',
    name: '偽物の流通',
    icon: '⚠',
    days: 3,
    mult: () => 0.4,
    weight: 2,
    rumor: (s) => `「${s}」の偽物が出回るかも…`,
    news: (s) => `⚠ ${s}の偽物が出回っている`,
  },
  ban: {
    type: 'ban',
    name: '販売禁止',
    icon: '🚫',
    days: 3,
    mult: () => 1,
    weight: 1.5,
    rumor: (s) => `お上が「${s}」の販売を禁じるらしい`,
    news: (s) => `🚫 ${s}が販売禁止に！（闇ルートなら…）`,
  },
};

export type ActiveEvent = { type: EventType; seriesId: string; until: number; mult: number };
export type ScheduledEvent = { type: EventType; seriesId: string; startDay: number };
export type Rumor = { text: string };

export type EventState = {
  active: ActiveEvent[];
  scheduled: ScheduledEvent[];
  /** 今朝の瓦版 */
  rumors: Rumor[];
  /** 今朝始まったイベントの告知 */
  news: string[];
};

export function initEvents(): EventState {
  return { active: [], scheduled: [], rumors: [{ text: '店を開いた。まずはガチャを回して景品を集めよう' }], news: [] };
}

// TODO(balance)
const EVENT_CHANCE_PER_DAY = 0.3;
/** 本物のイベントに噂が付く確率（販売禁止は必ず付く） */
const TRUE_RUMOR_RATE = 0.8;
const BASE_ACCURACY = 0.6;

const seriesName = (id: string) => SERIES_BY_ID[id].name;

function weightedType(): EventType {
  const defs = Object.values(EVENT_DEFS);
  let r = Math.random() * defs.reduce((a, d) => a + d.weight, 0);
  for (const d of defs) {
    r -= d.weight;
    if (r <= 0) return d.type;
  }
  return 'tv';
}

/** 今週の値動きパターンについての噂 */
function patternRumor(s: GameState, truthful: boolean): Rumor {
  const se = pick(SERIES);
  const sm = s.market.series[se.id];
  const later = sm.curve.slice(sm.dayIdx + 1);
  const willSpike = later.some((v) => v >= 1.8);
  const willFall = later.length > 0 && later[later.length - 1] < sm.trend * 0.85;
  // ガセのときは逆のことを言う
  const spike = truthful ? willSpike : !willSpike;
  if (spike) return { text: `「${se.name}」、今週のうちに跳ねるって噂` };
  return { text: truthful && willFall ? `「${se.name}」はこの先下がりっぱなしらしい` : `「${se.name}」は今週は大きく動かないらしい` };
}

/**
 * 朝に 1 回（advanceDay から）：イベントの開始・終了、新しい予定と噂を作る。
 * day は新しい日。
 */
export function advanceEvents(s: GameState): void {
  const ev = s.events;
  const day = s.day;
  ev.news = [];
  // 終わったものを外す
  ev.active = ev.active.filter((a) => a.until >= day);
  // 予定日になったものを始める
  for (const sc of ev.scheduled.filter((x) => x.startDay === day)) {
    const def = EVENT_DEFS[sc.type];
    // 同じシリーズの同じイベントは重ねない
    if (ev.active.some((a) => a.seriesId === sc.seriesId && a.type === sc.type)) continue;
    ev.active.push({ type: sc.type, seriesId: sc.seriesId, until: def.days === Infinity ? Infinity : day + def.days - 1, mult: def.mult() });
    ev.news.push(def.news(seriesName(sc.seriesId)));
  }
  ev.scheduled = ev.scheduled.filter((x) => x.startDay > day);

  const accuracy = Math.min(0.95, runHook(s, 'onRumorAccuracy', BASE_ACCURACY));
  const rumors: Rumor[] = [];
  // 新しいイベントの予定（2〜3 日後）
  if (Math.random() < EVENT_CHANCE_PER_DAY) {
    const type = weightedType();
    // 生産終了は一度きり
    const candidates = SERIES.filter((se) => !(type === 'discontinued' && ev.active.some((a) => a.type === 'discontinued' && a.seriesId === se.id)));
    if (candidates.length > 0) {
      const se = pick(candidates);
      ev.scheduled.push({ type, seriesId: se.id, startDay: day + 2 + Math.floor(Math.random() * 2) });
      if (type === 'ban' || Math.random() < TRUE_RUMOR_RATE) rumors.push({ text: EVENT_DEFS[type].rumor(se.name) });
    }
  }
  // ガセの噂（全体の的中率が accuracy 前後になるように混ぜる）
  const falseRate = EVENT_CHANCE_PER_DAY * TRUE_RUMOR_RATE * ((1 - accuracy) / accuracy);
  if (Math.random() < falseRate) {
    const type = pick<EventType>(['tv', 'fake', 'discontinued']); // 販売禁止のガセは流さない
    rumors.push({ text: EVENT_DEFS[type].rumor(pick(SERIES).name) });
  }
  // 値動きのヒント
  if (Math.random() < 0.6) rumors.push(patternRumor(s, Math.random() < accuracy));
  if (rumors.length === 0) rumors.push({ text: pick(['今日は特に噂もない、静かな朝だ', '常連さん曰く「最近ガチャが渋い」らしい', '夜中に瓶がカタカタ鳴っていた気がする']) });
  ev.rumors = rumors.slice(0, 3);
}

/** シリーズにかかっているイベント倍率（販売禁止は 1 のまま。売れるかは isBanned で見る） */
export function eventMult(s: GameState, seriesId: string): number {
  return s.events.active.filter((a) => a.seriesId === seriesId).reduce((m, a) => m * a.mult, 1);
}

export function isBanned(s: GameState, seriesId: string): boolean {
  return s.events.active.some((a) => a.seriesId === seriesId && a.type === 'ban');
}

export function activeOn(s: GameState, seriesId: string): ActiveEvent[] {
  return s.events.active.filter((a) => a.seriesId === seriesId);
}

/** 生産終了したシリーズはガチャで出にくくなる */
export function adjustedSeriesWeights(s: GameState, weights: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, w] of Object.entries(weights)) {
    out[id] = s.events.active.some((a) => a.seriesId === id && a.type === 'discontinued') ? w * 0.25 : w;
  }
  return out;
}

// ---- 闇ルート（販売禁止中のシリーズを半値で売る。30% で摘発されて罰金） ----
export const DARK_PRICE_RATE = 0.5;
export const DARK_CATCH_RATE = 0.3;
/** 摘発されたら売上の 2 倍を罰金として取られる */
export const DARK_FINE_RATE = 2;
