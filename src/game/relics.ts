// レリック：データ定義＋フック関数で効果を差し込む方式。
// 各フックは ctx.value を受け取り、新しい value を返す（undefined なら変更なし）。
// 複数レリックは所持順に連鎖適用されるため、倍率がかけ算でインフレしていく。
import type { GameState } from './state';

export type RelicHook = 'onSellPrice' | 'onGachaRoll' | 'onDayStart' | 'onNight' | 'onEvent' | 'onPayday';

export type HookCtx<V = unknown> = {
  state: GameState;
  value: V;
  [key: string]: unknown;
};

export type Relic = {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'legendary';
  // 仕様書の型に合わせて ctx は any 相当にしている
  hooks: Partial<Record<RelicHook, (ctx: HookCtx<any>) => any>>;
};

// TODO(Phase 2): 情報屋・鑑定士・倉庫番・早起き・招き猫・夜更かし（化ける確率アップ。旧「合体の達人」の置き換え）・目利き・ブーム便乗・逆張り・闇のツテ・コレクター・借金の天才
export const RELICS: Relic[] = [];

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
