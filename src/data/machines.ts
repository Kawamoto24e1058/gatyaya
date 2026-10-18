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
};

export const MACHINES: GachaMachineDef[] = [
  {
    id: 'hand',
    name: '手回し式',
    control: 'crank',
    cost: 20, // TODO(balance)
    capsulesPerPull: 1,
    rarityWeights: { N: 72, R: 20, SR: 6, SSR: 1.7, UR: 0.3 },
    seriesWeights: { mochi: 1, neji: 1, obake: 1 },
    bodyColor: 0xff5a7a,
  },
  // TODO(Phase 2): レバー式（下へ強く引く / 3 個 / 重い「ガシャン」）
  // TODO(Phase 3): 10連タワー（長押しで溜めて離す）、巨大ガチャ（2 本指で回す・カプセル in カプセル）
];

export const MACHINE_BY_ID: Record<string, GachaMachineDef> = Object.fromEntries(MACHINES.map((m) => [m.id, m]));
