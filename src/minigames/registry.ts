// バイトの登録。ここに 1 件追加するだけで新しいバイトが増える。
import { CAPSULE_FILL_BONUS_THRESHOLD, CapsuleFillGame } from './CapsuleFill';
import type { MiniGameDef } from './types';

export const MINIGAMES: MiniGameDef[] = [
  {
    id: 'capsule-fill',
    name: 'カプセル詰め',
    howTo: '流れてくるカプセルが黄色い枠に来たら\nタップして「パチッ」と蓋を閉める',
    bonusText: `${CAPSULE_FILL_BONUS_THRESHOLD}個以上詰めると 瓶の容量+1（今週のみ）`,
    create: () => new CapsuleFillGame(),
  },
  // TODO(Phase 2): 梱包（プチプチ）・倉庫整理（箱積み）
  // TODO(Phase 3): コイン計数（フリック仕分け）
];

export const MINIGAME_BY_ID: Record<string, MiniGameDef> = Object.fromEntries(MINIGAMES.map((m) => [m.id, m]));
