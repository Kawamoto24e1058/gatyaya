// 画面・バランス定数。数値バランスは未決（仕様書 11 章）。調整前提の仮値。
export const GAME_W = 720;

/** CSS の safe-area（ノッチ・ホームバー）を px で測る */
function measureSafeArea(): { top: number; bottom: number } {
  if (typeof document === 'undefined') return { top: 0, bottom: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const r = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  return r;
}

/**
 * 縦長スマホ（19.5:9 など）でも上下に黒帯が出ないよう、横幅 720 固定で高さを端末の縦横比に合わせる。
 * 1280（9:16）〜1640 の範囲。横長（PC）では 1280。
 */
function computeLayout() {
  const w = typeof window === 'undefined' ? 720 : window.innerWidth;
  const h = typeof window === 'undefined' ? 1280 : window.innerHeight;
  const height = Math.round(Math.min(1640, Math.max(1280, (GAME_W * h) / w)));
  const k = GAME_W / Math.max(1, Math.min(w, (h * GAME_W) / height));
  const safe = measureSafeArea();
  return { height, safeTop: Math.round(safe.top * k), safeBottom: Math.round(safe.bottom * k) };
}

const L = computeLayout();
export const GAME_H = L.height;
export const SAFE_TOP = L.safeTop;
export const SAFE_BOTTOM = L.safeBottom;
/** 9:16 を超えて余った高さ（各画面のレイアウトで配分する） */
export const EXTRA_H = Math.max(0, GAME_H - 1280 - SAFE_TOP - SAFE_BOTTOM);
/** 画面下端（ホームバーを避けた位置） */
export const BOTTOM = GAME_H - SAFE_BOTTOM;
export const HUD_H = 132;

export const FONT =
  '"Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",system-ui,sans-serif';

export const BALANCE = {
  // TODO(balance): 初期コイン・ガチャ代・ノルマはすべて仮値
  startCoins: 150,
  apPerDay: 6,
  apCost: {
    sell: 1,
    baito: 2,
    move: 1, // TODO(Phase 3): 町の移動
  },
  daysPerWeek: 7,
  // シミュレーター（npm run sim）で調整：縁起物をランダムに取るプレイで 5 週完済 約 7 割、縁起物なしでは約 5%
  firstQuota: 2000,
  quotaGrowth: 2.95,
  /** この週数を返済しきると町の借金を完済（TODO(未決)：総額・町ごとの差） */
  weeksPerTown: 5,
  jarCapacity: 20,
  /** ガチャで黒いカプセル（縁起物入り）が出る確率 */
  blackCapsuleRate: 0.004,
  /** 色違いを作るのに必要な数 */
  fuseMin: 3,
  /** 同じ日に 2 回目・3 回目のバイトは疲れて給料が減る（TODO(balance)） */
  baitoFatigue: [1, 0.7, 0.5],
  saturationPerSale: 0.92,
  saturationRecovery: 0.5,
  trendMin: 0.3,
  trendMax: 6.0,
} as const;

/**
 * 画風：夕暮れの駄菓子屋兼トレカ屋。ポップだが少し不気味。発光（ネオン）表現は使わない。
 * 輪郭は墨色の太線、影は「ずらしたベタ影」で描く。
 */
export const PAL = {
  ink: 0x24172e, // 輪郭・影
  night: 0x1d1426,
  dusk: 0x3b2440,
  plum: 0x5b3150,
  woodDark: 0x4a2c2a,
  wood: 0x7a4a34,
  woodLight: 0xa86d48,
  paper: 0xf6ead2,
  paperShade: 0xe2d0ae,
  vermilion: 0xd94b3d,
  mustard: 0xe8b13a,
  moss: 0x5a9a6e,
  teal: 0x3f8f96,
  lavender: 0x9b84c4,
  ghost: 0xdfe8f0,
  blood: 0xb0303a,
  white: 0xffffff,
} as const;

export const CSS = {
  ink: '#24172e',
  white: '#ffffff',
  cream: '#f6ead2',
  gold: '#e8b13a',
  good: '#5a9a6e',
  bad: '#d94b3d',
  sub: '#b8a3c8',
  accent: '#d94b3d',
  inkSoft: '#6e5a72',
  wood: '#7a4a34',
} as const;
