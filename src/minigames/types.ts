import type Phaser from 'phaser';
import type { GameState } from '../game/state';

/** お金以外の見返り。種類はデータで追加していく */
export type Reward =
  | { kind: 'jarCapacityWeek'; amount: number } // 瓶の容量 +n（その週のみ）
  | { kind: 'sellBonusWeek'; amount: number } // 売値 +n（割合・その週のみ）
  | { kind: 'coins'; amount: number } // 追加のコイン（両替ボーナス）
  | { kind: 'nightBoost' } // 今夜は化ける確率 ×2
  | { kind: 'apTomorrow'; amount: number } // 明日の提灯（AP）+n
  | { kind: 'relic' } // 縁起物を 3 つから 1 つ選べる（選ぶ画面はバイト画面が出す）
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
  /** 時間切れ前に終わる遊び（くじを全部削った等）は true を返す */
  isDone?(): boolean;
}

export type MiniGameDef = {
  id: string;
  name: string;
  /** 1 行説明（操作） */
  howTo: string;
  /** お金以外の見返りの説明 */
  bonusText: string;
  /** 運しだいの仕事（掲示板で「運」の札が付く） */
  luck?: boolean;
  create: () => MiniGame;
};

export function rewardLabel(r: Reward): string {
  switch (r.kind) {
    case 'jarCapacityWeek':
      return `瓶の容量 +${r.amount}（今週のみ）`;
    case 'sellBonusWeek':
      return `売値 +${Math.round(r.amount * 100)}%（今週のみ）`;
    case 'coins':
      return `両替ボーナス +${r.amount}コイン`;
    case 'nightBoost':
      return '今夜はカプセルが化けやすい（×2）';
    case 'apTomorrow':
      return `明日の提灯（AP）+${r.amount}`;
    case 'relic':
      return '縁起物をひとつもらえる';
    case 'none':
      return '';
  }
}

export function applyReward(s: GameState, r: Reward): void {
  switch (r.kind) {
    case 'jarCapacityWeek':
      s.jarBonusWeek += r.amount;
      break;
    case 'sellBonusWeek':
      s.sellBonusWeek += r.amount;
      break;
    case 'coins':
      s.coins += r.amount;
      s.today.wages += r.amount;
      break;
    case 'nightBoost':
      s.nightBoost = true;
      break;
    case 'apTomorrow':
      s.apBonusTomorrow += r.amount;
      break;
    case 'relic':
      break;
    case 'none':
      break;
  }
}
