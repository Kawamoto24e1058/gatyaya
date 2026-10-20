// 縁起物（レリック）：データ定義＋フック関数で効果を差し込む方式。
// 各フックは ctx.value を受け取り、新しい value を返す（undefined なら変更なし）。
// 複数の縁起物は所持順に連鎖適用されるため、倍率がかけ算でインフレしていく。
// 入手：ガチャの「黒いカプセル」（3 つから 1 つ）／返済後の取り立て屋（通常 2＋訳あり 1 から 1 つ）
// TODO(Phase 3)：夜の行商人（コインで買う）、バイトの高得点ご褒美、目利き（開封前にシリーズがわかる）
import { parseStock } from '../data/prizes';
import { nextRarity, type Rarity } from '../data/rarity';
import type { GameState } from './state';

export type RelicHook =
  | 'onSellPrice' // value: 売値（ctx.prizeId は所持品キー）
  | 'onGachaRoll' // value: 出たレア度
  | 'onPullCost' // value: ガチャ 1 回の値段
  | 'onPullRefund' // value: 1 回まわしたあとに戻るコイン
  | 'onDayStart' // value: その日の AP 上限
  | 'onJarCapacity' // value: 瓶の容量
  | 'onAttract' // value: 同じ色のカプセルが引き寄せ合う強さ
  | 'onSellApCost' // value: 出店の AP
  | 'onBaito' // value: バイト代
  | 'onNight' // value: 夜に化ける確率
  | 'onRumorAccuracy' // value: 噂の的中率
  | 'onDarkCatch' // value: 闇ルートで摘発される確率
  | 'onEvent' // TODO(Phase 2): イベント
  | 'onPayday'; // value: 今週の返済額

export type HookCtx<V = unknown> = {
  state: GameState;
  value: V;
  [key: string]: unknown;
};

/** common / rare は黒いカプセルと取り立て屋、boss は取り立て屋だけが出す（強いが欠点つき） */
export type RelicRarity = 'common' | 'rare' | 'boss';

export type Relic = {
  id: string;
  name: string;
  /** お守り袋に入れる 1 文字 */
  glyph: string;
  description: string;
  /** boss の欠点（説明に赤字で出す） */
  drawback?: string;
  rarity: RelicRarity;
  // 仕様書の型に合わせて ctx は any 相当にしている
  hooks: Partial<Record<RelicHook, (ctx: HookCtx<any>) => any>>;
};

const seriesOf = (key: string) => parseStock(key).prize.seriesId;
const trendOf = (ctx: HookCtx) => ctx.state.market.series[seriesOf(ctx.prizeId as string)].trend;

// TODO(balance)：効果量はすべて仮値
export const RELICS: Relic[] = [
  // ---- common ----
  { id: 'loupe', name: '鑑定士のルーペ', glyph: '鑑', rarity: 'common', description: 'すべての売値 ×1.1', hooks: { onSellPrice: (c) => c.value * 1.1 } },
  { id: 'bigjar', name: '大きな瓶', glyph: '瓶', rarity: 'common', description: '瓶の容量 +5', hooks: { onJarCapacity: (c) => c.value + 5 } },
  { id: 'rooster', name: '早起き鶏', glyph: '鶏', rarity: 'common', description: '毎日の提灯（AP）+1', hooks: { onDayStart: (c) => c.value + 1 } },
  {
    id: 'tanuki',
    name: '招き狸',
    glyph: '狸',
    rarity: 'common',
    description: 'ガチャ 1 回ごとに 8% でお代が戻ってくる',
    hooks: { onPullRefund: (c) => (Math.random() < 0.08 ? c.value + (c.cost as number) : c.value) },
  },
  { id: 'lantern', name: '夜更かし行灯', glyph: '灯', rarity: 'common', description: '夜のうちに化ける確率 ×2', hooks: { onNight: (c) => c.value * 2 } },
  { id: 'goldthread', name: '金の糸', glyph: '糸', rarity: 'common', description: '色違いの売値 ×1.2', hooks: { onSellPrice: (c) => (parseStock(c.prizeId as string).shiny ? c.value * 1.2 : c.value) } },
  { id: 'apron', name: '働き者の前掛け', glyph: '働', rarity: 'common', description: 'バイト代 ×1.4', hooks: { onBaito: (c) => Math.round(c.value * 1.4) } },
  { id: 'informant', name: '情報屋の耳', glyph: '耳', rarity: 'common', description: '噂が当たる確率 +20%', hooks: { onRumorAccuracy: (c) => c.value + 0.2 } },
  { id: 'magnet', name: '磁石の瓶', glyph: '磁', rarity: 'common', description: '同じ色のカプセルが強く引き寄せ合う', hooks: { onAttract: (c) => c.value + 2 } },

  // ---- rare ----
  { id: 'surf', name: '波乗り', glyph: '波', rarity: 'rare', description: '相場 ×1.8 以上のシリーズの売値 ×1.3', hooks: { onSellPrice: (c) => (trendOf(c) >= 1.8 ? c.value * 1.3 : c.value) } },
  { id: 'contrarian', name: '逆張り', glyph: '逆', rarity: 'rare', description: '相場 ×0.7 以下のシリーズの売値 ×1.4', hooks: { onSellPrice: (c) => (trendOf(c) <= 0.7 ? c.value * 1.4 : c.value) } },
  {
    id: 'collector',
    name: '収集家の箱',
    glyph: '集',
    rarity: 'rare',
    description: '同じシリーズを 5 種以上持っていると、そのシリーズの売値 ×1.4',
    hooks: {
      onSellPrice: (c) => {
        const sid = seriesOf(c.prizeId as string);
        const kinds = new Set(Object.keys(c.state.inventory).filter((k) => c.state.inventory[k] > 0 && seriesOf(k) === sid).map((k) => parseStock(k).prize.id));
        return kinds.size >= 5 ? c.value * 1.4 : c.value;
      },
    },
  },
  {
    id: 'luckycharm',
    name: '開運の招き札',
    glyph: '運',
    rarity: 'rare',
    description: 'ガチャで 6% の確率でレア度がひとつ上がる',
    hooks: { onGachaRoll: (c) => (Math.random() < 0.06 ? (nextRarity(c.value as Rarity) ?? c.value) : c.value) },
  },
  { id: 'darkties', name: '闇のツテ', glyph: '闇', rarity: 'rare', description: '闇ルートで摘発されない', hooks: { onDarkCatch: () => 0 } },
  {
    id: 'genius',
    name: '借金の天才',
    glyph: '借',
    rarity: 'rare',
    description: '返済額の 15% を翌週に繰り延べできる',
    hooks: { onPayday: (c) => Math.round(c.value * 0.85) },
  },

  // ---- boss（取り立て屋の訳あり品） ----
  {
    id: 'goldhandle',
    name: '黄金のハンドル',
    glyph: '金',
    rarity: 'boss',
    description: 'ガチャ代が 2 割引き',
    drawback: '毎日の提灯（AP）-1',
    hooks: { onPullCost: (c) => Math.max(1, Math.round(c.value * 0.8)), onDayStart: (c) => c.value - 1 },
  },
  {
    id: 'glutton',
    name: '大食いの瓶',
    glyph: '食',
    rarity: 'boss',
    description: '瓶の容量 +15',
    drawback: 'ガチャ代 +5',
    hooks: { onJarCapacity: (c) => c.value + 15, onPullCost: (c) => c.value + 5 },
  },
  {
    id: 'hawker',
    name: '押し売りの看板',
    glyph: '押',
    rarity: 'boss',
    description: 'すべての売値 ×1.25',
    drawback: '出店に提灯（AP）が 2 つ必要',
    hooks: { onSellPrice: (c) => c.value * 1.25, onSellApCost: (c) => c.value + 1 },
  },
  {
    id: 'nightveil',
    name: '夜の帳',
    glyph: '帳',
    rarity: 'boss',
    description: '夜のうちに化ける確率 ×4',
    drawback: 'バイト代が半分',
    hooks: { onNight: (c) => c.value * 4, onBaito: (c) => Math.round(c.value * 0.5) },
  },
];

export const RELIC_BY_ID: Record<string, Relic> = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export function runHook<V>(state: GameState, hook: RelicHook, value: V, extra: Record<string, unknown> = {}): V {
  let v = value;
  for (const id of state.relics) {
    const fn = RELIC_BY_ID[id]?.hooks[hook];
    if (!fn) continue;
    const r = fn({ ...extra, state, value: v });
    if (r !== undefined) v = r as V;
  }
  return v;
}

/** まだ持っていない縁起物から n 個選ぶ */
export function rollRelics(state: GameState, n: number, rarities: RelicRarity[]): Relic[] {
  const pool = RELICS.filter((r) => rarities.includes(r.rarity) && !state.relics.includes(r.id));
  const out: Relic[] = [];
  while (out.length < n && pool.length > 0) {
    // rare は common の半分の出やすさ
    const weights = pool.map((r) => (r.rarity === 'rare' ? 1 : 2));
    let t = Math.random() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < pool.length - 1; i++) {
      t -= weights[i];
      if (t <= 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** 返済後の取り立て屋が出す品：通常 2 つ＋訳あり（boss）1 つ */
export function paydayOffer(state: GameState): Relic[] {
  return [...rollRelics(state, 2, ['common', 'rare']), ...rollRelics(state, 1, ['boss'])];
}
