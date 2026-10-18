import Phaser from 'phaser';
import { RARITY_INFO, type Rarity } from '../data/rarity';
import { capsuleKey } from '../ui/textures';

/** 瓶の中で物理演算されるカプセル */
export class Capsule extends Phaser.Physics.Matter.Image {
  /** 合体中・開封中は true（重複処理防止） */
  busy = false;
  glow?: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly rarity: Rarity,
  ) {
    super(scene.matter.world, x, y, capsuleKey(rarity), undefined, {
      shape: { type: 'circle', radius: RARITY_INFO[rarity].radius },
      restitution: 0.3,
      friction: 0.04,
      frictionAir: 0.008,
      density: 0.0015,
    });
    scene.add.existing(this);
    this.setDepth(200);
    const r = RARITY_INFO[rarity].radius;
    // 指で押しやすいよう判定を少し広げる
    this.setInteractive(new Phaser.Geom.Circle(this.width / 2, this.height / 2, r + 8), Phaser.Geom.Circle.Contains);

    if (RARITY_INFO[rarity].index >= 3) {
      this.glow = scene.add
        .image(x, y, 'glow')
        .setTint(RARITY_INFO[rarity].color)
        .setScale((r * 3.2) / 128)
        .setDepth(199)
        .setAlpha(0.6);
      scene.tweens.add({ targets: this.glow, alpha: 0.25, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  syncGlow() {
    this.glow?.setPosition(this.x, this.y);
  }

  destroy(fromScene?: boolean) {
    // 出現・合体時の拡大アニメが残ったまま消えると、物理ボディ消滅後に scale が更新されて落ちる
    this.scene?.tweens.killTweensOf(this);
    if (this.glow) this.scene?.tweens.killTweensOf(this.glow);
    this.glow?.destroy();
    this.glow = undefined;
    super.destroy(fromScene);
  }
}
