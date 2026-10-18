// バイト（ミニゲーム）の進行：掲示板で仕事を選ぶ → カウントダウン → プレイ → 結果
import Phaser from 'phaser';
import { BALANCE, BOTTOM, CSS, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { fmt } from '../core/util';
import { rollRelics, runHook } from '../game/relics';
import { addRelic, S, save } from '../game/state';
import { MINIGAME_BY_ID, pickBoard } from '../minigames/registry';
import { applyReward, rewardLabel, type MiniGame, type MiniGameDef } from '../minigames/types';
import { Hud } from '../ui/Hud';
import { showRelicPicker } from '../ui/RelicPicker';
import { Button, countUp, drawPlate, stamp, title, txt } from '../ui/widgets';

const M = GAME_H / 2;

export class BaitoScene extends Phaser.Scene {
  private def!: MiniGameDef;
  private board: MiniGameDef[] = [];
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
    // 掲示板の求人は遊ぶまで貼り替えない（「やめる」で引き直せないように）
    const s = S();
    if (s.baitoBoard.length === 0 || s.baitoBoard.some((id) => !MINIGAME_BY_ID[id])) {
      s.baitoBoard = pickBoard(s.lastBaito);
      save();
    }
    this.board = s.baitoBoard.map((id) => MINIGAME_BY_ID[id]);
    this.def = (data?.id && MINIGAME_BY_ID[data.id]) || this.board[0];
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

  /** 掲示板：求人チラシが 3 枚。1 枚選んで「はじめる」 */
  private showIntro() {
    const c = this.add.container(0, 0).setDepth(700);
    const top = this.hudBottom + 30;
    const bottom = BOTTOM - 272;
    // コルクの掲示板
    const bg = this.add.graphics();
    drawPlate(bg, 24, top, 672, bottom - top, PAL.woodDark, { radius: 14, shadow: 8, outline: 5, shine: false });
    bg.fillStyle(0xb98a5a, 1);
    bg.fillRoundedRect(40, top + 56, 640, bottom - top - 72, 8);
    bg.fillStyle(0x000000, 0.08);
    for (let i = 0; i < 90; i++) bg.fillCircle(50 + ((i * 97) % 620), top + 66 + ((i * 53) % (bottom - top - 92)), 2 + (i % 3));
    c.add(bg);
    c.add(txt(this, 360, top + 30, 'バイト募集の掲示板', 28, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 }));

    const n = this.board.length;
    const areaTop = top + 70;
    const slotH = (bottom - areaTop - 14) / n;
    const fh = Math.min(260, slotH - 16);
    let selected = -1;
    const start = new Button(this, 360, BOTTOM - 170, {
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
    start.setEnabled(false);
    const flyers = this.board.map((def, i) => {
      const f = this.add.container(360, areaTop + slotH * i + slotH / 2).setAngle(i % 2 ? 1.5 : -1.5);
      const g = this.add.graphics();
      drawPlate(g, -300, -fh / 2, 600, fh, PAL.paper, { radius: 8, shadow: 7, outline: 5, shine: false });
      g.fillStyle(def.luck ? PAL.lavender : PAL.vermilion, 1);
      g.fillRect(-300, -fh / 2, 96, fh);
      g.fillStyle(PAL.ink, 1);
      g.fillCircle(0, -fh / 2, 10);
      g.fillStyle(PAL.mustard, 1);
      g.fillCircle(0, -fh / 2 - 2, 6);
      f.add(g);
      f.add(txt(this, -252, -fh / 2 + 44, def.luck ? '運' : '腕', 44, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 }));
      f.add(txt(this, -252, fh / 2 - 40, def.luck ? '一発\n勝負' : 'コツ\nコツ', 20, { color: CSS.cream }));
      f.add(txt(this, 40, -fh / 2 + 34, def.name, 32, { color: CSS.ink }));
      f.add(txt(this, 40, -4, def.howTo, 22, { color: CSS.ink, bold: false, wrap: 480 }));
      f.add(txt(this, 40, fh / 2 - 34, `特典：${def.bonusText}`, 20, { color: CSS.inkSoft, wrap: 480 }));
      const ring = this.add.graphics();
      ring.lineStyle(7, PAL.vermilion, 1);
      ring.strokeRoundedRect(-306, -fh / 2 - 6, 612, fh + 12, 12);
      ring.setVisible(false);
      f.add(ring);
      const mark = title(this, 250, -fh / 2 + 30, 'これ!', 30, CSS.bad).setAngle(14).setVisible(false);
      f.add(mark);
      f.setSize(600, fh).setInteractive({ useHandCursor: true });
      f.on('pointerdown', () => {
        if (selected === i) return;
        selected = i;
        this.def = def;
        sfx.play('flip', { rate: 1.2 });
        flyers.forEach((o, k) => {
          o.ring.setVisible(k === i);
          o.mark.setVisible(k === i);
          o.f.setScale(k === i ? 1.03 : 1);
        });
        start.setEnabled(true).setPulse(true);
      });
      c.add(f);
      return { f, ring, mark };
    });
    const cancel = new Button(this, 360, BOTTOM - 62, { w: 300, h: 80, color: PAL.plum, label: 'やめる', size: 28, onPress: () => this.leave() });
    c.add([start, cancel]);
    c.add(txt(this, 360, bottom + 16, '貼り紙をタップして選ぶ', 22, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }));
  }

  private begin() {
    const s = S();
    s.ap -= BALANCE.apCost.baito;
    s.lastBaito = this.def.id;
    s.baitoBoard = [];
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
    if (this.remaining <= 0 || this.game_.isDone?.()) this.finish();
  }

  private finish() {
    if (!this.game_) return;
    this.playing = false;
    const result = this.game_.onEnd();
    this.game_.destroy?.();
    const s = S();
    // 縁起物でバイト代が増減する
    result.coins = runHook(s, 'onBaito', result.coins);
    s.coins += result.coins;
    s.today.wages += result.coins;
    // 縁起物が出たが、もう全部持っている場合はお金に替える
    const relicChoices = result.bonus?.kind === 'relic' ? rollRelics(s, 3, ['common', 'rare']) : [];
    if (result.bonus?.kind === 'relic' && relicChoices.length === 0) result.bonus = { kind: 'coins', amount: 60 };
    if (result.bonus) applyReward(s, result.bonus);
    save();
    if (relicChoices.length > 0) {
      this.time.delayedCall(1200, () =>
        showRelicPicker(this, {
          heading: '招き猫のご利益！',
          sub: '縁起物をひとつ持っていける',
          relics: relicChoices,
          onDone: (r) => {
            if (r) addRelic(s, r.id);
            save();
          },
        }),
      );
    }
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
