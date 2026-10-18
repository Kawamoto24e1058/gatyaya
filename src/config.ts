// 画面・バランス定数。数値バランスは未決（仕様書 11 章）。調整前提の仮値。
export const GAME_W = 720;
export const GAME_H = 1280;

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
  firstQuota: 500,
  quotaGrowth: 2.2,
  jarCapacity: 20,
  saturationPerSale: 0.92,
  saturationRecovery: 0.5,
  trendMin: 0.3,
  trendMax: 5.0,
} as const;

export const COLORS = {
  bg: 0x2a1f45,
  bgDark: 0x1b1430,
  wall: 0x3a2a5e,
  floor: 0x241a3c,
  panel: 0xfff6e6,
  panelDark: 0x2f2450,
  ink: 0x2a1f45,
  accent: 0xff5a7a,
  gold: 0xffc531,
  good: 0x4fd18b,
  bad: 0xff5a5a,
  white: 0xffffff,
} as const;

export const CSS = {
  ink: '#2a1f45',
  white: '#ffffff',
  cream: '#fff6e6',
  gold: '#ffc531',
  good: '#4fd18b',
  bad: '#ff5a5a',
  sub: '#b9a9e0',
  accent: '#ff5a7a',
} as const;
