import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { BaitoScene } from './scenes/BaitoScene';
import { BootScene } from './scenes/BootScene';
import { CloseScene } from './scenes/CloseScene';
import { GameOverScene } from './scenes/GameOverScene';
import { MarketScene } from './scenes/MarketScene';
import { PaydayScene } from './scenes/PaydayScene';
import { ShopScene } from './scenes/ShopScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#1b1430',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 効果音は自前の Web Audio エンジン（core/audio.ts）で鳴らすため Phaser の音は無効化
  audio: { noAudio: true },
  input: { activePointers: 3 },
  render: { antialias: true, powerPreference: 'high-performance' },
  fps: { target: 60 },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.6 },
      positionIterations: 8,
      velocityIterations: 6,
      debug: false,
    },
  },
  scene: [BootScene, ShopScene, MarketScene, BaitoScene, CloseScene, PaydayScene, GameOverScene],
});
