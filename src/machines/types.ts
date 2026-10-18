import type Phaser from 'phaser';
import type { GachaMachineDef, MachineControl } from '../data/machines';

/** ガチャ機の見た目・入力・音を担当するビュー。機種（操作方式）ごとに実装する */
export interface MachineView {
  readonly def: GachaMachineDef;
  /** カプセルが出てくる位置 */
  readonly outlet: { x: number; y: number };
  destroy(): void;
  /** 他の UI が前面にある間などに入力を止める */
  setInputEnabled(on: boolean): void;
}

export type MachineHooks = {
  /** 回してよいか。不可なら理由の文字列を返す */
  canPull: () => true | string;
  /** 1 回分の操作が完了した（カプセルを排出する） */
  onPull: () => void;
  /** 回せないときの通知 */
  onDenied: (reason: string) => void;
};

export type MachineFactory = (scene: Phaser.Scene, def: GachaMachineDef, hooks: MachineHooks) => MachineView;

const registry = new Map<MachineControl, MachineFactory>();

export function registerMachineView(control: MachineControl, f: MachineFactory) {
  registry.set(control, f);
}

export function createMachineView(scene: Phaser.Scene, def: GachaMachineDef, hooks: MachineHooks): MachineView {
  const f = registry.get(def.control);
  if (!f) throw new Error(`machine view not registered: ${def.control}`);
  return f(scene, def, hooks);
}
