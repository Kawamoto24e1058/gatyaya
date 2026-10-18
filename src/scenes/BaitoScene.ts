// バイト（ミニゲーム）の進行：説明 → カウントダウン → プレイ → 結果
import Phaser from 'phaser';
import { BALANCE, CSS, GAME_W } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { S, save } from '../game/state';
import { MINIGAME_BY_ID } from '../minigames/registry';
import { applyReward, rewardLabel, type MiniGame, type MiniGameDef } from '../minigames/types';
import { Hud } from '../ui/Hud';
import { Button, countUp, panel, txt } from '../ui/widgets';

export class BaitoScene extends Phaser.Scene {
  private def!: MiniGameDef;
  private game_: MiniGame | null = null;
  private hud!: Hud;
  private remaining = 0;
  private playing = false;
  private timerBar!: Phaser.GameObjects.Graphics;
  private lastWholeSec = 0;

  constructor() {
    super('Baito');
  }

  init(data: { id?: string }) {
    this.def = MINIGAME_BY_ID[data.id ?? 'capsule-fill'];
    this.game_ = null;
    this.playing = false;
  }

  create() {
    const bg = this.add.graphics();
    bg.fillStyle(0x26304a, 1);
    bg.fillRect(0, 0, GAME_W, 1280);
    bg.fillStyle(0xffffff, 0.04);
    for (let y = 140; y < 1280; y += 60) bg.fillRect(0, y, GAME_W, 2);
    this.hud = new Hud(this);
    this.timerBar = this.add.graphics().setDepth(600);
    this.showIntro();
  }

  private showIntro() {
    const c = this.add.container(0, 0).setDepth(700);
    c.add(panel(this, 360, 620, 620, 640));
    c.add(txt(this, 360, 360, `バイト：${this.def.name}`, 40, { color: CSS.ink }));
    c.add(txt(this, 360, 470, this.def.howTo, 26, { color: CSS.ink, bold: false, wrap: 560 }));
    c.add(txt(this, 360, 570, `収入は少ないが確実\n＋ ${this.def.bonusText}`, 24, { color: '#6b5f8a', bold: false, wrap: 560 }));
    const start = new Button(this, 360, 720, {
      w: 420,
      h: 110,
      color: 0x4fd18b,
      label: 'はじめる',
      sub: `${BALANCE.apCost.baito}AP`,
      onPress: () => {
        c.destroy();
        this.begin();
      },
    });
    const cancel = new Button(this, 360, 850, { w: 300, h: 80, color: 0x8a80a6, label: 'やめる', size: 28, onPress: () => this.leave() });
    c.add([start, cancel]);
  }

  private begin() {
    const s = S();
    s.ap -= BALANCE.apCost.baito;
    save();
    this.hud.refresh();
    const n = txt(this, 360, 640, '3', 140, { stroke: '#1b1430', strokeThickness: 12 }).setDepth(800);
    const steps = ['3', '2', '1', 'スタート！'];
    steps.forEach((label, i) => {
      this.time.delayedCall(i * 500, () => {
        n.setText(label).setScale(1.4).setAlpha(1);
        this.tweens.add({ targets: n, scale: 1, duration: 200, ease: 'Back.easeOut' });
        sfx.play(i < 3 ? 'tick' : 'pop', { rate: i < 3 ? 1 : 1.2 });
      });
    });
    this.time.delayedCall(steps.length * 500 - 150, () => {
      this.tweens.add({ targets: n, alpha: 0, duration: 200, onComplete: () => n.destroy() });
      this.game_ = this.def.create();
      this.game_.start(this);
      this.remaining = this.game_.durationSec;
      this.lastWholeSec = Math.ceil(this.remaining);
      this.playing = true;
    });
  }

  update(_t: number, delta: number) {
    if (!this.playing || !this.game_) return;
    const dt = Math.min(0.05, delta / 1000);
    this.game_.update?.(dt);
    this.remaining -= dt;
    const whole = Math.ceil(this.remaining);
    if (whole < this.lastWholeSec) {
      this.lastWholeSec = whole;
      if (whole <= 5 && whole > 0) sfx.play('tick', { rate: 0.8 });
    }
    const ratio = Math.max(0, this.remaining / this.game_.durationSec);
    const g = this.timerBar;
    g.clear();
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(40, 140, 640, 22, 11);
    g.fillStyle(ratio < 0.2 ? 0xff5a5a : 0x4fd18b, 1);
    g.fillRoundedRect(40, 140, Math.max(22, 640 * ratio), 22, 11);
    if (this.remaining <= 0) this.finish();
  }

  private finish() {
    if (!this.game_) return;
    this.playing = false;
    const result = this.game_.onEnd();
    this.game_.destroy?.();
    const s = S();
    s.coins += result.coins;
    s.today.wages += result.coins;
    if (result.bonus) applyReward(s, result.bonus);
    save();
    sfx.play('reji', { rate: 1.1 });

    const c = this.add.container(0, 0).setDepth(900);
    c.add(this.add.rectangle(360, 640, GAME_W, 1280, 0x000000, 0.5).setInteractive());
    c.add(panel(this, 360, 640, 600, 560));
    c.add(txt(this, 360, 420, 'おつかれさま！', 40, { color: CSS.ink }));
    if (result.summary) c.add(txt(this, 360, 490, result.summary, 22, { color: '#6b5f8a', bold: false, wrap: 540 }));
    c.add(txt(this, 360, 560, 'バイト代', 24, { color: '#6b5f8a', bold: false }));
    const coinT = txt(this, 360, 610, '+0', 60, { color: '#d18a00' });
    c.add(coinT);
    countUp(this, 0, result.coins, 600, (v) => coinT.setText(`+${fmt(v)}`), () => this.hud.refresh());
    const bonusLabel = result.bonus ? rewardLabel(result.bonus) : '';
    c.add(
      txt(this, 360, 690, bonusLabel ? `ボーナス：${bonusLabel}` : 'ボーナスなし（もう少し！）', 26, {
        color: bonusLabel ? '#1f9e5a' : '#8a80a6',
      }),
    );
    if (bonusLabel) this.time.delayedCall(300, () => sfx.play('sparkle'));
    c.add(new Button(this, 360, 800, { w: 380, h: 100, color: 0xff5a7a, label: '店に戻る', onPress: () => this.leave() }));
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 200 });
  }

  private leave() {
    sfx.play('whoosh');
    this.game_?.destroy?.();
    this.game_ = null;
    this.scene.stop();
    this.scene.wake('Shop');
  }
}
