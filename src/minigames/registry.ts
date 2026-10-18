// バイトの登録。ここに 1 件追加するだけで新しいバイトが増える。
import Phaser from 'phaser';
import { BoxStackGame, STACK_BONUS_BOXES } from './BoxStack';
import { BUBBLE_BONUS_SHEETS, BubbleWrapGame } from './BubbleWrap';
import { CAPSULE_FILL_BONUS_THRESHOLD, CapsuleFillGame } from './CapsuleFill';
import { COIN_BONUS_CORRECT, CoinSortGame } from './CoinSort';
import { GHOST_BONUS, GhostWhackGame } from './GhostWhack';
import { LANTERN_BONUS_LIT, LanternGame } from './Lantern';
import { OmikujiGame, OMIKUJI_BONUS_DAIKICHI } from './Omikuji';
import { ScratchGame } from './Scratch';
import type { MiniGameDef } from './types';

export const MINIGAMES: MiniGameDef[] = [
  {
    id: 'capsule-fill',
    name: 'カプセル詰め',
    howTo: '流れてくるカプセルが黄色い枠に来たら\nタップして「パチッ」と蓋を閉める',
    bonusText: `${CAPSULE_FILL_BONUS_THRESHOLD}個以上詰めると 瓶の容量+1（今週のみ）`,
    create: () => new CapsuleFillGame(),
  },
  {
    id: 'bubble-wrap',
    name: '梱包プチプチ',
    howTo: '指でなぞってプチプチを全部つぶす\n1 枚つぶし切ると梱包完了',
    bonusText: `${BUBBLE_BONUS_SHEETS}箱以上梱包すると 売値+5%（今週のみ）`,
    create: () => new BubbleWrapGame(),
  },
  {
    id: 'box-stack',
    name: '倉庫整理',
    howTo: '左右に動く箱をタップで落として積む\nはみ出た分は切り落とされる',
    bonusText: `${STACK_BONUS_BOXES}箱以上積むと 瓶の容量+2（今週のみ）`,
    create: () => new BoxStackGame(),
  },
  {
    id: 'coin-sort',
    name: '両替の仕分け',
    howTo: '金貨は ← 、銀貨は → 、偽金は ↓ へ\nフリックして仕分ける',
    bonusText: `${COIN_BONUS_CORRECT}枚以上仕分けると 両替ボーナス（給料の30%）`,
    create: () => new CoinSortGame(),
  },
  {
    id: 'ghost-whack',
    name: 'お化け払い',
    howTo: '棚から顔を出すお化けをタップで払う\nお客さんを叩くとクレーム（-3）',
    bonusText: `${GHOST_BONUS}匹以上払い、クレーム2回以内なら 今夜は化けやすい（×2）`,
    create: () => new GhostWhackGame(),
  },
  {
    id: 'lantern',
    name: '提灯の火入れ',
    howTo: '長押しで火を育て\n黄色い帯に入ったところで離す',
    bonusText: `${LANTERN_BONUS_LIT}個以上灯すと 明日の提灯（AP）+1`,
    create: () => new LanternGame(),
  },
  {
    id: 'scratch',
    name: 'くじの検品',
    howTo: 'スクラッチくじを指でこすって削る\n同じ絵が 3 つそろえば当たり（4 枚）',
    bonusText: '招き猫が 3 つそろうと 縁起物をひとつもらえる',
    luck: true,
    create: () => new ScratchGame(),
  },
  {
    id: 'omikuji',
    name: 'おみくじ番',
    howTo: 'おみくじを引くほど稼ぎが増える\n凶が出たらその回の稼ぎは没収。やめ時が肝心（3 回）',
    bonusText: `大吉を${OMIKUJI_BONUS_DAIKICHI}回引くと 今夜は化けやすい（×2）`,
    luck: true,
    create: () => new OmikujiGame(),
  },
];

export const MINIGAME_BY_ID: Record<string, MiniGameDef> = Object.fromEntries(MINIGAMES.map((m) => [m.id, m]));

/** 掲示板に貼る求人を n 件選ぶ。前回の仕事は外し、運しだいの仕事を必ず 1 件入れる */
export function pickBoard(lastId: string, n = 3): string[] {
  const pool = MINIGAMES.filter((m) => m.id !== lastId);
  const luck = pool.filter((m) => m.luck);
  const out: MiniGameDef[] = [];
  if (luck.length > 0) out.push(luck[Math.floor(Math.random() * luck.length)]);
  const rest = pool.filter((m) => !out.includes(m));
  while (out.length < n && rest.length > 0) out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
  return Phaser.Utils.Array.Shuffle(out).map((m) => m.id);
}
