// ガチャ機の定義。操作方式（control）ごとに見た目・入力・音を machines/ 側で実装し、ここはデータのみ。
import type { Rarity } from './rarity';

export type MachineControl = 'crank' | 'lever' | 'tower' | 'giant';

export type GachaMachineDef = {
  id: string;
  name: string;
  control: MachineControl;
  /** 1 回のコスト（コイン） */
  cost: number;
  /** 1 回で出るカプセル数 */
  capsulesPerPull: number;
  rarityWeights: Record<Rarity, number>;
  /** 排出される景品シリーズと重み（相場戦略に関係） */
  seriesWeights: Record<string, number>;
  bodyColor: number;
  /** フタなどの差し色 */
  accent?: number;
  /** ひとこと説明（機材の一覧に出す） */
  blurb?: string;
  /** 店に設置する代金（解禁後、夜の改装で買う） */
  installCost?: number;
};

// TODO(balance)：どの機種も「中身の期待値 ÷ 代金」が 1.25〜1.45 程度。違いは振れ幅と使い勝手
export const MACHINES: GachaMachineDef[] = [
  {
    id: 'hand',
    name: '手回し式',
    control: 'crank',
    cost: 20,
    capsulesPerPull: 1,
    rarityWeights: { N: 72, R: 20, SR: 6, SSR: 1.7, UR: 0.3 },
    seriesWeights: { mochi: 1, neji: 1, obake: 1 },
    bodyColor: 0xd94b3d,
    blurb: '最初の 1 台。1 回 20 で 1 個',
  },
  {
    id: 'triple',
    name: '三連ガチャ',
    control: 'crank',
    cost: 58,
    capsulesPerPull: 3,
    rarityWeights: { N: 72, R: 20, SR: 6, SSR: 1.7, UR: 0.3 },
    seriesWeights: { mochi: 1, neji: 1, obake: 1 },
    bodyColor: 0x3f8f96,
    accent: 0xe8b13a,
    blurb: '1 回で 3 個。1 個あたり少し安い',
    installCost: 600,
  },
  {
    id: 'obake',
    name: 'おばけ屋敷ガチャ',
    control: 'crank',
    cost: 26,
    capsulesPerPull: 1,
    rarityWeights: { N: 55, R: 28, SR: 12, SSR: 4, UR: 1 },
    seriesWeights: { mochi: 0, neji: 0, obake: 1 },
    bodyColor: 0x5b3150,
    accent: 0x9b84c4,
    blurb: 'おばけ商店街だけが出る。レアも出やすい（相場の読みが大事）',
    installCost: 800,
  },
  {
    id: 'kin',
    name: '金のガチャ',
    control: 'crank',
    cost: 66,
    capsulesPerPull: 1,
    rarityWeights: { N: 25, R: 40, SR: 24, SSR: 9, UR: 2 },
    seriesWeights: { mochi: 1, neji: 1, obake: 1 },
    bodyColor: 0xc9952c,
    accent: 0xfff1b8,
    blurb: '高いが N がほとんど出ない',
    installCost: 1800,
  },
  {
    id: 'yami',
    name: '闇ガチャ',
    control: 'crank',
    cost: 66,
    capsulesPerPull: 1,
    rarityWeights: { N: 62, R: 14, SR: 10, SSR: 8, UR: 6 },
    seriesWeights: { mochi: 1, neji: 1, obake: 1 },
    bodyColor: 0x1d1426,
    accent: 0xb0303a,
    blurb: 'ほとんどハズレ。でも UR が 20 倍出る一発勝負',
    installCost: 2500,
  },
];

export const MACHINE_BY_ID: Record<string, GachaMachineDef> = Object.fromEntries(MACHINES.map((m) => [m.id, m]));
