import type Phaser from 'phaser';
import type { GameState } from '../game/state';

/** お金以外の見返り。種類はデータで追加していく */
export type Reward =
  | { kind: 'jarCapacityWeek'; amount: number } // 瓶の容量 +n（その週のみ）
  // TODO(Phase 2): 梱包＝売却手数料減、倉庫整理＝倉庫上限+2、コイン計数＝両替ボーナス
  | { kind: 'none' };

/** 仕様書 5 章の MiniGame インターフェース（update / destroy は進行管理用に追加） */
export interface MiniGame {
  id: string;
  name: string;
  durationSec: number;
  start(scene: Phaser.Scene): void;
  onEnd(): { coins: number; bonus?: Reward; summary?: string };
  update?(dtSec: number): void;
  destroy?(): void;
}

export type MiniGameDef = {
  id: string;
  name: string;
  /** 1 行説明（操作） */
  howTo: string;
  /** お金以外の見返りの説明 */
  bonusText: string;
  create: () => MiniGame;
};

export function rewardLabel(r: Reward): string {
  switch (r.kind) {
    case 'jarCapacityWeek':
      return `瓶の容量 +${r.amount}（今週のみ）`;
    case 'none':
      return '';
  }
}

export function applyReward(s: GameState, r: Reward): void {
  switch (r.kind) {
    case 'jarCapacityWeek':
      s.jarBonusWeek += r.amount;
      break;
    case 'none':
      break;
  }
}
