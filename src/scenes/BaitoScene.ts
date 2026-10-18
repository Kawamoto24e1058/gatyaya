// バイト（ミニゲーム）の進行：説明 → カウントダウン → プレイ → 結果
import Phaser from 'phaser';
import { BALANCE, CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { S, save } from '../game/state';
import { MINIGAME_BY_ID } from '../minigames/registry';
import { applyReward, rewardLabel, type MiniGame, type MiniGameDef } from '../minigames/types';
import { Hud } from '../ui/Hud';
import { Button, countUp, drawPlate, stamp, title, txt } from '../ui/widgets';

const M = GAME_H / 2;

export class BaitoScene extends Phaser.Scene {
  private def!: MiniGameDef;
  private game_: MiniGame | null = null;
  private hud!: Hud;
  private remaining = 0;
  private playing = false;
  private timerBar!: Phaser.GameObjects.Graphics;
  private lastWholeSec = 0;
  private hudBottom = 0;

  constructor() {
    super('Baito');
  }

  init(data: { id?: string }) {
    this.def = MINIGAME_BY_ID[data.id ?? 'capsule-fill'];
    this.game_ = null;
    this.playing = false;
  }

  create() {
    this.add.image(0, 0, 'bg_back').setOrigin(0);
    // 裏の作業場：壁のタイル
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.035);
    for (let y = 0; y < GAME_H; y += 64) for (let x = (y / 64) % 2 ? 0 : 32; x < GAME_W; x += 64) bg.fillRect(x, y, 30, 30);
    this.hud = new Hud(this);
    this.hudBottom = Hud.bottom();
    this.timerBar = this.add.graphics().setDepth(600);
    this.showIntro();
  }

  private showIntro() {
    const c = this.add.container(0, 0).setDepth(700);
    // 求人チラシ
    const flyer = this.add.container(360, M - 40).setAngle(-2);
    const g = this.add.graphics();
    drawPlate(g, -300, -330, 600, 560, PAL.paper, { radius: 10, shadow: 9, outline: 5, shine: false });
    g.fillStyle(PAL.vermilion, 1);
    g.fillRect(-300, -330, 600, 96);
    g.fillStyle(PAL.ink, 1);
    g.fillRect(-300, -238, 600, 5);
    // 画鋲
    g.fillStyle(PAL.ink, 1);
    g.fillCircle(0, -334, 14);
    g.fillStyle(PAL.mustard, 1);
    g.fillCircle(0, -336, 9);
    flyer.add(g);
    flyer.add(title(this, -150, -282, '急募！', 52, CSS.cream));
    flyer.add(txt(this, 140, -282, `バイト\n${this.def.name}`, 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }));
    flyer.add(txt(this, 0, -150, this.def.howTo, 26, { color: CSS.ink, wrap: 540 }));
    flyer.add(txt(this, 0, -40, '時給：少ないが確実', 26, { color: CSS.bad }));
    flyer.add(txt(this, 0, 40, `特典：${this.def.bonusText}`, 22, { color: CSS.inkSoft, wrap: 540 }));
    flyer.add(txt(this, 0, 150, '面接なし・即日勤務OK', 20, { color: CSS.inkSoft, bold: false }));
    c.add(flyer);
    const start = new Button(this, 360, M + 300, {
      w: 420,
      h: 110,
      color: PAL.moss,
      label: 'はじめる',
      sub: `${BALANCE.apCost.baito}AP`,
      onPress: () => {
        c.destroy();
        this.begin();
      },
    });
    const cancel = new Button(this, 360, M + 430, { w: 300, h: 80, color: PAL.plum, label: 'やめる', size: 28, onPress: () => this.leave() });
    c.add([start, cancel]);
  }

  private begin() {
    const s = S();
    s.ap -= BALANCE.apCost.baito;
    save();
    this.hud.refresh();
    const n = title(this, 360, M - 60, '3', 150, CSS.cream).setDepth(800);
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
    const ty = this.hudBottom + 22;
    drawPlate(g, 40, ty, 640, 26, PAL.night, { radius: 13, shadow: 4, outline: 4, shine: false });
    g.fillStyle(ratio < 0.2 ? PAL.vermilion : PAL.mustard, 1);
    g.fillRoundedRect(40, ty, Math.max(26, 640 * ratio), 26, 13);
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
    c.add(this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.6).setInteractive());
    // 給料袋
    const env = this.add.container(360, M - 60);
    const eg = this.add.graphics();
    drawPlate(eg, -260, -280, 520, 500, 0xc9a06a, { radius: 10, shadow: 9, outline: 5, shine: false });
    eg.fillStyle(0xb68a54, 1);
    eg.fillTriangle(-260, -280, 260, -280, 0, -150);
    eg.lineStyle(5, PAL.ink, 1);
    eg.strokeTriangle(-260, -280, 260, -280, 0, -150);
    drawPlate(eg, -190, -110, 380, 250, PAL.paper, { radius: 6, shadow: 0, outline: 4, shine: false });
    env.add(eg);
    env.add(txt(this, 0, -200, '給料袋', 34, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 7 }));
    env.add(txt(this, 0, -80, 'おつかれさま！', 32, { color: CSS.ink }));
    if (result.summary) env.add(txt(this, 0, -36, result.summary, 19, { color: CSS.inkSoft, bold: false, wrap: 340 }));
    env.add(txt(this, 0, 10, 'バイト代', 22, { color: CSS.inkSoft }));
    const coinT = txt(this, 0, 62, '+0', 64, { color: CSS.bad });
    env.add(coinT);
    countUp(this, 0, result.coins, 600, (v) => coinT.setText(`+${fmt(v)}`), () => this.hud.refresh());
    const bonusLabel = result.bonus ? rewardLabel(result.bonus) : '';
    env.add(
      txt(this, 0, 180, bonusLabel ? `特典：${bonusLabel}` : '特典なし（もう少し！）', 24, {
        color: bonusLabel ? CSS.cream : '#5a3e2a',
        stroke: bonusLabel ? CSS.ink : undefined,
        strokeThickness: bonusLabel ? 5 : 0,
      }),
    );
    c.add(env);
    env.setScale(0.3).setAngle(-12);
    this.tweens.add({ targets: env, scale: 1, angle: 2, duration: 320, ease: 'Back.easeOut' });
    if (bonusLabel) {
      this.time.delayedCall(450, () => {
        sfx.play('sparkle');
        stamp(this, 520, M - 300, '特典GET!', 40, CSS.gold, { hold: Infinity, depth: 950 }).setAngle(12);
      });
    }
    c.add(new Button(this, 360, M + 300, { w: 380, h: 104, color: PAL.vermilion, label: '店に戻る', onPress: () => this.leave() }));
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
