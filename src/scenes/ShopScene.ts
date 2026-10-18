// メイン画面：ガチャ機・カプセルの瓶・行動ボタン。演出の強さは常にガチャが最大。
import Phaser from 'phaser';
import { BALANCE, BOTTOM, CSS, EXTRA_H, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { pick, vibrate, weightedPick } from '../core/util';
import { MACHINE_BY_ID, type GachaMachineDef } from '../data/machines';
import { KIND_LABEL, prizesOf, SERIES, stockKey, type Prize } from '../data/prizes';
import { RARITY_INFO, type Rarity } from '../data/rarity';
import { Capsule } from '../game/Capsule';
import { adjustedSeriesWeights } from '../game/events';
import { RELIC_BY_ID, rollRelics, runHook } from '../game/relics';
import { showKawaraban } from '../ui/Kawaraban';
import { Coach } from '../ui/Coach';
import { tilt } from '../core/tilt';
import { showRelicPicker } from '../ui/RelicPicker';
import { omamoriKey } from '../ui/textures';
import { addRelic, daysUntilPayday, dueAmount, inventoryCount, isPayday, jarCapacity, pullCost, S, save, saveNow, sellApCost } from '../game/state';
import { createMachineView, type MachineView } from '../machines/types';
import '../machines/HandCrankMachine';
import { addDust, addLantern, addPeekingEyes, addWisps } from '../ui/Ambient';
import { paintShopBg } from '../ui/art';
import { Hud } from '../ui/Hud';
import { ITEM_Y, makePrizeView, twinkle, VIEW_H } from '../ui/PrizeView';
import { canvasTex } from '../ui/textures';
import { Button, drawPlate, floatText, stamp, toast, txt } from '../ui/widgets';

const BTN_H = 112;
const TUTORIAL_KEY = 'gatyaya.tutorial';
const TUTORIAL_DONE = 99;
function loadTutorialStep(): number {
  try {
    return Number(localStorage.getItem(TUTORIAL_KEY) ?? 0) || 0;
  } catch {
    return TUTORIAL_DONE;
  }
}
function saveTutorialStep(n: number) {
  try {
    localStorage.setItem(TUTORIAL_KEY, String(n));
  } catch {
    /* noop */
  }
}
/** くっついてから合成するまでの待ち（目印を見せる時間） */
const FUSE_WAIT_MS = 250;
/** 「くっついている」とみなす隙間（px） */
const TOUCH_SLACK = 24;
/** 同じ色のカプセルどうしがほんのり引き寄せ合う強さ（付喪神の仲間意識）。磁石の瓶で強くなる */
const BASE_ATTRACT = 1;

export class ShopScene extends Phaser.Scene {
  private hud!: Hud;
  private machine!: MachineView;
  private def!: GachaMachineDef;
  private capsules: Capsule[] = [];
  private btnSell!: Button;
  private btnBaito!: Button;
  private btnClose!: Button;
  private jarLabel!: Phaser.GameObjects.Text;
  private invLabel!: Phaser.GameObjects.Text;
  private invIcon!: Phaser.GameObjects.Container;
  private emptyHint!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private jar = { left: 56, right: 664, top: 780, bottom: 1130 };
  private btnY = 1206;
  private lastKnockAt = 0;
  private closeArmedUntil = 0;
  private revealing = 0;
  private restoreQueue: { r: Rarity; shiny: boolean }[] = [];
  private relicShelf?: Phaser.GameObjects.Container;
  private coach?: Coach;
  private machineTop = 0;
  private lastShuffleAt = 0;
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private shelfKey: string | null = null;
  private clusterSince = new Map<Capsule, number>();
  private lastClusterCheck = 0;
  private btnShuffle!: Button;

  constructor() {
    super('Shop');
  }

  create() {
    // シーン再起動時にフィールドが残るのでリセット
    this.capsules = [];
    this.closeArmedUntil = 0;
    this.revealing = 0;
    this.clusterSince = new Map();
    this.lastClusterCheck = 0;
    this.relicShelf = undefined;
    this.shelfKey = null;

    // ---- レイアウト（縦長端末では余白を機械の上と瓶に配分） ----
    const top = Hud.bottom();
    const machineTop = top + 34 + Math.round(EXTRA_H * 0.3);
    this.btnY = BOTTOM - BTN_H / 2 - 18;
    this.def = MACHINE_BY_ID[S().machineId];
    this.machine = createMachineView(
      this,
      this.def,
      {
        canPull: () => this.canPull(),
        onPull: () => this.pull(),
        onDenied: (reason) => toast(this, reason, this.jar.top + 90),
      },
      { top: machineTop },
    );
    this.jar = { left: 52, right: 668, top: this.machine.bottom + 22, bottom: this.btnY - BTN_H / 2 - 30 };

    this.drawBackground(top);
    this.buildJar();
    this.hud = new Hud(this);

    this.sparks = this.add.particles(0, 0, 'spark', {
      emitting: false,
      speed: { min: 140, max: 440 },
      scale: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      lifespan: { min: 350, max: 700 },
      gravityY: 600,
    });
    this.sparks.setDepth(400);
    this.confetti = this.add.particles(0, 0, 'confetti', {
      emitting: false,
      speed: { min: 250, max: 650 },
      angle: { min: 220, max: 320 },
      rotate: { start: 0, end: 720 },
      scaleX: { start: 1, end: 0.3 },
      lifespan: 1600,
      gravityY: 900,
      tint: [PAL.vermilion, PAL.mustard, PAL.moss, PAL.teal, PAL.lavender, PAL.paper],
    });
    this.confetti.setDepth(960);

    this.buildButtons();
    this.buildKawarabanPin(top);

    // 保存済みのカプセルを上から降らせる
    // 降らせ終わるまでは、まだ出していない分もセーブに残す（途中でアプリを閉じても消えないように）
    this.restoreQueue = S().jar.map((r, i) => ({ r, shiny: S().jarShiny[i] ?? false }));
    this.restoreQueue.forEach((_, i) => {
      this.time.delayedCall(i * 70, () => {
        const next = this.restoreQueue.shift();
        if (!next) return;
        this.spawnCapsule(Phaser.Math.Between(this.jar.left + 60, this.jar.right - 60), this.jar.top + 10, next.r, 0, 2, next.shiny);
        this.refreshUI(false);
      });
    });

    this.matter.world.on('collisionstart', this.onCollision, this);

    this.events.on(Phaser.Scenes.Events.WAKE, this.onWake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.WAKE, this.onWake, this);
      this.machine.destroy();
    });

    this.refreshUI(false);
    this.coach = new Coach(this);
    this.keys = this.input.keyboard?.createCursorKeys();
    // スマホを振ったら瓶をまぜる（ほかの画面に行っている間は無視）
    tilt.onShake = () => {
      if (this.scene.isActive() && this.capsules.length > 1) this.shuffleJar();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (tilt.onShake = null));
    this.machineTop = machineTop;
    if (S().pendingMorning) this.morningBanner();
    else this.tutorial('start');
  }

  // ---------- 描画 ----------

  private drawBackground(hudBottom: number) {
    const counterY = this.jar.bottom + 18;
    const key = `bg_shop_${GAME_H}_${counterY}`;
    canvasTex(this, key, GAME_W, GAME_H, (c) => paintShopBg(c, { w: GAME_W, h: GAME_H, hudBottom, counterY }));
    this.add.image(0, 0, key).setOrigin(0).setDepth(0);
    addLantern(this, 640, hudBottom - 6, 0.8, 8);
    addPeekingEyes(this, 623, hudBottom + 22 + 3 * 64 + 36, 4);
    addWisps(this, { x: 40, y: hudBottom + 40, w: 160, h: 360 }, 2, 5);
    addDust(this, { x: 0, y: hudBottom, w: GAME_W, h: this.jar.top - hudBottom }, 6);
  }

  private buildJar() {
    const J = this.jar;
    const g = this.add.graphics().setDepth(50);
    // 瓶の影と胴
    g.fillStyle(PAL.ink, 0.6);
    g.fillRoundedRect(J.left - 2, J.top + 4, J.right - J.left + 16, J.bottom - J.top + 12, 40);
    g.fillStyle(PAL.ink, 1);
    g.fillRoundedRect(J.left - 14, J.top - 6, J.right - J.left + 28, J.bottom - J.top + 20, 44);
    g.fillStyle(0x4d3a58, 1);
    g.fillRoundedRect(J.left - 8, J.top, J.right - J.left + 16, J.bottom - J.top + 8, 38);
    g.fillStyle(0xffffff, 0.06);
    g.fillRoundedRect(J.left - 8, J.top, J.right - J.left + 16, (J.bottom - J.top) * 0.45, { tl: 38, tr: 38, bl: 0, br: 0 });
    // 前面のガラスの反射（カプセルより手前）
    const front = this.add.graphics().setDepth(210);
    front.fillStyle(0xffffff, 0.16);
    front.fillRoundedRect(J.left + 4, J.top + 34, 16, J.bottom - J.top - 80, 8);
    front.fillStyle(0xffffff, 0.1);
    front.fillRoundedRect(J.left + 28, J.top + 34, 6, J.bottom - J.top - 120, 3);
    front.fillStyle(0xffffff, 0.12);
    front.fillRoundedRect(J.right - 22, J.top + 60, 8, 90, 4);
    // 口のふち
    drawPlate(front, J.left - 18, J.top - 22, J.right - J.left + 36, 24, PAL.woodLight, { radius: 12, shadow: 0, outline: 5 });

    const opts = { isStatic: true, friction: 0.1, restitution: 0.2 };
    const t = 40;
    this.matter.add.rectangle((J.left + J.right) / 2, J.bottom + t / 2, J.right - J.left + t * 2, t, opts);
    // 側壁は上方向へ高く伸ばし、カプセルがこぼれないようにする（見えない部分あり）
    const wallTop = J.top - 420;
    const wallH = J.bottom - wallTop;
    this.matter.add.rectangle(J.left - t / 2, J.bottom - wallH / 2, t, wallH, opts);
    this.matter.add.rectangle(J.right + t / 2, J.bottom - wallH / 2, t, wallH, opts);

    // ラベル：瓶の容量（左）・所持品（右）
    const lbl = this.add.graphics().setDepth(220);
    drawPlate(lbl, J.left + 6, J.top + 14, 136, 40, PAL.paper, { radius: 8, shadow: 4, outline: 4, shine: false });
    this.jarLabel = txt(this, J.left + 74, J.top + 34, '', 24, { color: CSS.ink }).setDepth(221);

    this.btnShuffle = new Button(this, 360, J.top + 34, {
      w: 170,
      h: 48,
      color: PAL.teal,
      label: 'まぜる',
      size: 24,
      onPress: () => this.shuffleJar(),
      onDenied: () => toast(this, 'カプセルが 2 つ以上あるとまぜられる', this.jar.top + 90),
    }).setDepth(230);

    this.invIcon = this.add.container(J.right - 74, J.top + 34).setDepth(220);
    const ig = this.add.graphics();
    drawPlate(ig, -68, -20, 136, 40, PAL.paper, { radius: 8, shadow: 4, outline: 4, shine: false });
    ig.fillStyle(PAL.vermilion, 1);
    ig.fillRoundedRect(-58, -12, 30, 24, 4);
    ig.lineStyle(3, PAL.ink, 1);
    ig.strokeRoundedRect(-58, -12, 30, 24, 4);
    ig.lineBetween(-43, -12, -43, 12);
    this.invLabel = txt(this, 14, 0, '', 24, { color: CSS.ink });
    this.invIcon.add([ig, this.invLabel]);

    this.emptyHint = txt(this, 360, (J.top + J.bottom) / 2 + 20, 'ハンドルを回してカプセルを出そう\nカプセルはタップで開封\n同じ色が3つくっつくと色違いに！\nスマホを傾ける・振ると寄せられる', 26, {
      color: CSS.cream,
      stroke: CSS.ink,
      strokeThickness: 6,
    }).setDepth(60);
  }

  private buildButtons() {
    const y = this.btnY;
    this.btnSell = new Button(this, 128, y, {
      w: 212,
      h: BTN_H,
      color: PAL.moss,
      icon: 'ic_sell',
      label: '売る',
      sub: `出店 ${sellApCost(S())}AP`,
      size: 34,
      onPress: () => this.goMarket(),
      onDenied: () => this.explainDenied('sell'),
    });
    this.btnBaito = new Button(this, 360, y, {
      w: 212,
      h: BTN_H,
      color: PAL.teal,
      icon: 'ic_baito',
      label: 'バイト',
      sub: `${BALANCE.apCost.baito}AP`,
      size: 34,
      onPress: () => this.goBaito(),
      onDenied: () => this.explainDenied('baito'),
    });
    this.btnClose = new Button(this, 592, y, {
      w: 212,
      h: BTN_H,
      color: PAL.vermilion,
      icon: 'ic_close',
      label: '閉店',
      sub: '今日を終える',
      size: 34,
      onPress: () => this.closeShop(),
    });
    for (const b of [this.btnSell, this.btnBaito, this.btnClose]) b.setDepth(300);
    // TODO(Phase 3): 町を移動する（1AP）
    // TODO(Phase 2): 町の掲示板（噂）
  }

  private refreshUI(animateHud = true) {
    const s = S();
    this.hud.refresh(animateHud);
    const full = this.capsules.length >= jarCapacity(s);
    this.jarLabel.setText(`瓶 ${this.capsules.length}/${jarCapacity(s)}`);
    this.jarLabel.setColor(full ? CSS.bad : CSS.ink);
    this.invLabel.setText(`所持 ${inventoryCount(s)}`);
    // 初回の説明中はガチャ機がしゃべるので、案内文は出さない
    this.emptyHint.setVisible(this.capsules.length === 0 && s.jar.length === 0 && s.totals.pulls < 3 && loadTutorialStep() >= TUTORIAL_DONE);
    this.btnSell.setLabel('売る', `出店 ${sellApCost(s)}AP`);
    this.btnSell.setEnabled(s.ap >= sellApCost(s) && inventoryCount(s) > 0);
    this.machine.setPrice?.(pullCost(s, this.def.cost));
    this.renderRelicShelf();
    this.btnBaito.setEnabled(s.ap >= BALANCE.apCost.baito);
    this.btnClose.setPulse(s.ap === 0);
    this.btnShuffle.setEnabled(this.capsules.length > 1);
  }

  // ---------- ガチャ ----------

  private canPull(): true | string {
    const s = S();
    if (s.coins < pullCost(s, this.def.cost)) return 'コインが足りない…\n景品を売るかバイトで稼ごう';
    if (this.capsules.length + this.restoreQueue.length >= jarCapacity(s)) return '瓶がいっぱい！\nタップで開けるか、合体させて空けよう';
    return true;
  }

  private pull() {
    const s = S();
    const cost = pullCost(s, this.def.cost);
    s.coins -= cost;
    s.today.pulls += 1;
    s.today.gachaSpent += cost;
    s.totals.pulls += 1;
    const ct = this.hud.coinTarget();
    floatText(this, ct.x + 120, ct.y + 30, `-${cost}`, CSS.bad, 26);

    // 招き狸など：お代が戻る
    const refund = runHook(s, 'onPullRefund', 0, { cost });
    if (refund > 0) {
      s.coins += refund;
      s.today.gachaSpent -= refund;
      this.time.delayedCall(250, () => {
        sfx.play('coin');
        floatText(this, ct.x + 120, ct.y + 70, `お代返し +${refund}`, CSS.gold, 24);
      });
    }

    // まれに黒いカプセル（縁起物入り）
    if (Math.random() < BALANCE.blackCapsuleRate && rollRelics(s, 3, ['common', 'rare']).length > 0) {
      this.blackCapsule();
      this.refreshUI();
      save();
      return;
    }

    const rolled = weightedPick(this.def.rarityWeights);
    const rarity = runHook(s, 'onGachaRoll', rolled, { machineId: this.def.id });
    const out = this.machine.outlet;
    const c = this.spawnCapsule(out.x + Phaser.Math.Between(-6, 6), out.y, rarity, Phaser.Math.FloatBetween(-1.4, 1.4), 3);
    // 飛び出しのスクワッシュ
    c.setScale(0.75);
    this.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.noteBest(rarity);
    this.rareDispenseFx(rarity, out.x, out.y);
    this.tutorial('pulled');
    this.refreshUI();
    save();
  }

  /** レア排出演出。ガチャ演出は常にいちばん派手にする */
  private rareDispenseFx(r: Rarity, x: number, y: number) {
    const info = RARITY_INFO[r];
    if (info.index < 2) return;
    this.machine.react(info.index);
    sfx.play('sparkle', { delay: 0.1, rate: 1 + (info.index - 2) * 0.06 });
    // ヒットストップ
    if (info.index >= 3) {
      this.matter.world.pause();
      this.time.delayedCall(info.index >= 4 ? 170 : 90, () => this.matter.world.resume());
    }
    const scale = 0.9 + (info.index - 2) * 0.7;
    const rays = this.add.image(x, y - 20, 'rays').setTint(info.color).setDepth(95).setScale(0.3).setAlpha(0.9);
    this.tweens.add({ targets: rays, scale, rotation: 1.2, duration: 500 + info.index * 120, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: rays, alpha: 0, delay: 300 + info.index * 150, duration: 500, onComplete: () => rays.destroy() });
    const label = r === 'UR' ? 'UR!!!' : r === 'SSR' ? 'SSR!!' : 'SR!';
    stamp(this, x + 150, y - 80, label, 44 + info.index * 10, info.css, { hold: 500 + info.index * 150, angle: -10 });
    if (info.index >= 3) {
      this.cameras.main.shake(160, 0.006 + (info.index - 3) * 0.004);
      this.confetti.explode(30 + (info.index - 3) * 50, x, y - 20);
      sfx.play('stamp', { vol: 0.8 });
    }
    if (info.index >= 4) {
      // 一瞬暗転してから光る
      const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.6).setDepth(90);
      this.tweens.add({ targets: dim, alpha: 0, duration: 700, delay: 200, onComplete: () => dim.destroy() });
      this.cameras.main.flash(260, 255, 236, 200);
      vibrate([30, 40, 60]);
    }
  }

  private noteBest(r: Rarity) {
    const s = S();
    if (!s.totals.bestRarity || RARITY_INFO[r].index > RARITY_INFO[s.totals.bestRarity].index) s.totals.bestRarity = r;
  }

  private spawnCapsule(x: number, y: number, r: Rarity, vx = 0, vy = 0, shiny = false): Capsule {
    const c = new Capsule(this, x, y, r, shiny);
    c.setVelocity(vx, vy);
    c.setAngularVelocity(Phaser.Math.FloatBetween(-0.08, 0.08));
    c.on('pointerdown', () => this.openCapsule(c));
    this.capsules.push(c);
    this.syncJar();
    return c;
  }

  private removeCapsule(c: Capsule) {
    this.capsules = this.capsules.filter((x) => x !== c);
    c.destroy();
    this.syncJar();
  }

  private syncJar() {
    S().jar = [...this.capsules.map((c) => c.rarity), ...this.restoreQueue.map((q) => q.r)];
    S().jarShiny = [...this.capsules.map((c) => c.shiny), ...this.restoreQueue.map((q) => q.shiny)];
  }

  // ---------- 3 つ以上くっつくと色違いに ----------

  /**
   * 同じレア度（色違い以外）のカプセルが 3 つ以上つながって触れ合っていたら、少し待ってから合成する。
   * 待つ間は金の輪で知らせる（どれがまとまるか一目でわかるように）。
   */
  private checkClusters() {
    const now = this.time.now;
    if (now - this.lastClusterCheck < 150) return;
    this.lastClusterCheck = now;
    const pool = this.capsules.filter((c) => c.active && !c.busy && !c.shiny);
    const seen = new Set<Capsule>();
    const inCluster = new Set<Capsule>();
    for (const start of pool) {
      if (seen.has(start)) continue;
      // 触れ合っている同色をたどる
      const group: Capsule[] = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const c = stack.pop()!;
        group.push(c);
        for (const o of pool) {
          if (seen.has(o) || o.rarity !== c.rarity) continue;
          const touch = RARITY_INFO[c.rarity].radius + RARITY_INFO[o.rarity].radius + TOUCH_SLACK;
          if (Phaser.Math.Distance.Between(c.x, c.y, o.x, o.y) <= touch) {
            seen.add(o);
            stack.push(o);
          }
        }
      }
      if (group.length < BALANCE.fuseMin) continue;
      for (const c of group) {
        inCluster.add(c);
        if (!this.clusterSince.has(c)) this.clusterSince.set(c, now);
        c.setMarked(true);
      }
      // 全員が一定時間くっついていたら合成
      if (group.every((c) => now - (this.clusterSince.get(c) ?? now) >= FUSE_WAIT_MS)) this.fuse(group);
    }
    // 離れたものは目印を外す
    for (const [c] of this.clusterSince) {
      if (!inCluster.has(c)) {
        this.clusterSince.delete(c);
        if (c.active) c.setMarked(false);
      }
    }
  }

  /** くっついたカプセルを 1 つの色違いカプセルにまとめる（レア度は上がらない） */
  private fuse(chain: Capsule[]) {
    const s = S();
    // まとまる先は群れの中心にいちばん近いカプセル
    const mx = chain.reduce((a, c) => a + c.x, 0) / chain.length;
    const my = chain.reduce((a, c) => a + c.y, 0) / chain.length;
    const target = chain.reduce((best, c) => (Phaser.Math.Distance.Between(c.x, c.y, mx, my) < Phaser.Math.Distance.Between(best.x, best.y, mx, my) ? c : best));
    for (const c of chain) {
      this.clusterSince.delete(c);
      c.setMarked(false);
    }
    const { x, y } = target;
    const r = target.rarity;
    for (const c of chain) {
      c.busy = true;
      c.setStatic(true);
    }
    for (const c of chain) {
      if (c !== target) this.tweens.add({ targets: c, x, y, duration: 180, ease: 'Quad.easeIn' });
    }
    sfx.play('whoosh', { rate: 1.4 });
    this.time.delayedCall(200, () => {
      for (const c of chain) this.removeCapsule(c);
      const nc = this.spawnCapsule(x, y, r, 0, -6, true);
      nc.setScale(0.5);
      this.tweens.add({ targets: nc, scale: 1, duration: 300, ease: 'Back.easeOut' });
      const info = RARITY_INFO[r];
      sfx.play('pop', { rate: 0.9 + info.index * 0.1 });
      sfx.play('sparkle', { delay: 0.05 });
      vibrate(20);
      const ring = this.add.image(x, y, 'ring').setTint(PAL.mustard).setDepth(300).setScale((info.radius * 2) / 128);
      this.tweens.add({ targets: ring, scale: (info.radius * 2 * 3) / 128, alpha: 0, duration: 480, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      this.sparks.setParticleTint(PAL.mustard);
      this.sparks.explode(16 + chain.length * 3, x, y);
      const sx = Phaser.Math.Clamp(x, 170, GAME_W - 170);
      const sy = Phaser.Math.Clamp(y - 80, this.jar.top + 110, this.jar.bottom - 100);
      stamp(this, sx, sy, chain.length > BALANCE.fuseMin ? `${chain.length}つ合成！ 色違い` : '3つそろって色違い！', 34, CSS.gold, { hold: 600, depth: 450 });
      // 4 つ以上つないだらおまけのコイン
      const extra = chain.length - BALANCE.fuseMin;
      if (extra > 0) {
        const bonus = extra * 5 * (info.index + 1); // TODO(balance)
        s.coins += bonus;
        sfx.play('coin', { delay: 0.15 });
        const ct = this.hud.coinTarget();
        floatText(this, ct.x + 120, ct.y + 30, `+${bonus}`, CSS.gold, 28);
      }
      s.today.fusions += 1;
      this.refreshUI();
      save();
    });
  }

  // ---------- まぜる ----------

  private shuffleJar() {
    const s = S();
    // 連打で飛ばしすぎないよう、少しだけ間を空ける
    if (this.time.now - this.lastShuffleAt < 400) return;
    this.lastShuffleAt = this.time.now;
    s.today.shuffles += 1;
    sfx.play('whoosh', { rate: 0.8 });
    this.cameras.main.shake(260, 0.004);
    for (const c of this.capsules) {
      if (c.busy || !c.active) continue;
      c.setVelocity(Phaser.Math.FloatBetween(-6, 6), Phaser.Math.FloatBetween(-11, -6));
      c.setAngularVelocity(Phaser.Math.FloatBetween(-0.3, 0.3));
    }
    for (let k = 0; k < 5; k++) this.time.delayedCall(120 + k * 90, () => sfx.play('knock', { rate: 0.9 + Math.random() * 0.4 }));
    this.refreshUI();
    save();
  }

  // ---------- 傾き・振る・磁石 ----------

  /** スマホを傾けた方向（PC は ← →）へ重力を傾ける。磁石の瓶があれば同じ色が引き寄せ合う */
  private applyTilt() {
    let tx = tilt.x;
    if (this.keys?.left.isDown) tx = -1;
    else if (this.keys?.right.isDown) tx = 1;
    this.matter.world.setGravity(tx * 1.3, 1.6);

    const pull = runHook(S(), 'onAttract', BASE_ATTRACT);
    if (pull > 0) {
      const list = this.capsules.filter((c) => c.active && !c.busy && !c.shiny);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a.rarity !== b.rarity) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < 1 || d > 220) continue;
          const f = 0.00008 * pull * ((a.body as MatterJS.BodyType | null)?.mass ?? 1);
          a.applyForce(new Phaser.Math.Vector2((dx / d) * f, (dy / d) * f));
          b.applyForce(new Phaser.Math.Vector2((-dx / d) * f, (-dy / d) * f));
        }
      }
    }
  }

  // ---------- ぶつかる音 ----------

  private onCollision(ev: Phaser.Physics.Matter.Events.CollisionStartEvent) {
    const now = this.time.now;
    for (const pair of ev.pairs) {
      // ぶつかった強さに応じて鳴らす
      const va = pair.bodyA.velocity;
      const vb = pair.bodyB.velocity;
      const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
      if (rel > 2.5 && now - this.lastKnockAt > 45) {
        this.lastKnockAt = now;
        sfx.play('knock', { vol: Math.min(1, rel / 12) * 0.7, rate: 0.9 + Math.random() * 0.25 });
      }
    }
  }

  // ---------- 夜のうちに化ける ----------

  /** 昨夜化けたカプセルを、朝に「ガタガタ → ポンッ」と見せる（状態はすでに advanceDay で更新済み） */
  private playNightChanges() {
    const s = S();
    const idx = s.nightChanges;
    if (idx.length === 0) return;
    s.nightChanges = [];
    save();
    const targets = idx.map((i) => ({ i, c: this.capsules[i] })).filter((t) => t.c && t.c.active && !t.c.busy);
    if (targets.length === 0) return;

    toast(this, '夜のうちに、瓶の中で何かが…', this.jar.top + 90);
    sfx.play('rumble', { vol: 0.7, rate: 1.3 });
    // 瓶がガタガタ揺れる
    for (let k = 0; k < 6; k++) {
      this.time.delayedCall(k * 120, () => {
        for (const { c } of targets) if (c.active) c.setVelocity(Phaser.Math.FloatBetween(-3, 3), -Phaser.Math.FloatBetween(2, 5));
        sfx.play('knock', { rate: 0.8 + k * 0.05 });
      });
    }
    this.cameras.main.shake(700, 0.003);
    targets.forEach(({ i, c }, n) => {
      this.time.delayedCall(1000 + n * 800, () => {
        if (!c.active) return;
        const nr = S().jar[i] ?? c.rarity;
        const old = c.rarity;
        const nc = this.replaceCapsule(c, nr);
        this.transformFx(nc.x, nc.y, old, nr);
      });
    });
  }

  /** 同じ位置・同じ並び順のまま、別レア度のカプセルに差し替える */
  private replaceCapsule(c: Capsule, r: Rarity): Capsule {
    const i = this.capsules.indexOf(c);
    const nc = new Capsule(this, c.x, c.y, r, c.shiny);
    nc.on('pointerdown', () => this.openCapsule(nc));
    nc.setVelocity(0, -5);
    nc.setScale(0.6);
    this.tweens.add({ targets: nc, scale: 1, duration: 280, ease: 'Back.easeOut' });
    if (i >= 0) this.capsules[i] = nc;
    else this.capsules.push(nc);
    c.destroy();
    this.syncJar();
    this.refreshUI();
    return nc;
  }

  private transformFx(x: number, y: number, from: Rarity, to: Rarity) {
    const info = RARITY_INFO[to];
    sfx.play('pop', { rate: 0.8 + info.index * 0.12 });
    vibrate(20);
    const ring = this.add.image(x, y, 'ring').setTint(info.color).setDepth(300).setScale((info.radius * 2) / 128);
    this.tweens.add({ targets: ring, scale: (info.radius * 2 * 3) / 128, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    this.sparks.setParticleTint(info.color);
    this.sparks.explode(12 + info.index * 6, x, y);
    const sx = Phaser.Math.Clamp(x, 190, GAME_W - 190);
    const sy = Phaser.Math.Clamp(y - 90, this.jar.top + 110, this.jar.bottom - 120);
    stamp(this, sx, sy, `化けた！ ${from}→${to}`, 32 + info.index * 2, info.index >= 3 ? info.css : CSS.cream, { hold: 600, depth: 450 });
    if (info.index >= 3) {
      // 夜に SSR / UR が生まれるのは事件
      this.machine.react(info.index);
      this.confetti.explode(30 + (info.index - 3) * 40, x, y);
      sfx.play('sparkle', { delay: 0.1 });
      sfx.play('stamp', { delay: 0.05 });
      this.cameras.main.shake(200, 0.006);
    }
  }

  // ---------- 開封 ----------

  private openCapsule(c: Capsule) {
    if (c.busy || !c.active) return;
    // TODO(Phase 2): 倉庫上限（超える場合は開封不可）
    c.busy = true;
    c.setStatic(true);
    const info = RARITY_INFO[c.rarity];
    const x0 = c.x;
    const y0 = c.y;
    const amp = 2 + info.index * 1.6;
    const charge = info.chargeMs;
    c.setDepth(320);

    const glow = this.add
      .image(x0, y0, 'glow')
      .setTint(info.color)
      .setDepth(319)
      .setAlpha(0)
      .setScale(0.4);
    this.tweens.add({ targets: glow, alpha: 0.9, scale: 1.0 + info.index * 0.35, duration: charge, ease: 'Quad.easeIn' });

    // 溜め：揺れ幅と光が徐々に増え、ふくらむ
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: charge,
      onUpdate: (tw) => {
        const p = tw.getValue() ?? 0;
        const k = p * p;
        c.setPosition(x0 + Math.sin(p * 60) * amp * k, y0 - k * (4 + info.index * 4));
        c.setRotation(Math.sin(p * 47) * 0.12 * k * (1 + info.index * 0.3));
        c.setScale(1 + k * 0.12);
      },
      onComplete: () => {
        glow.destroy();
        this.burst(c);
      },
    });
    if (info.index >= 2) {
      const n = 3 + info.index * 3;
      for (let k = 0; k < n; k++) {
        const t = charge * (1 - Math.pow(1 - k / n, 1.8));
        this.time.delayedCall(t, () => sfx.play('charge', { rate: 0.9 + k * 0.07, vol: 0.5 + (k / n) * 0.5 }));
      }
    } else {
      sfx.play('charge', { vol: 0.4 });
    }
  }

  private burst(c: Capsule) {
    const s = S();
    const info = RARITY_INFO[c.rarity];
    const { x, y } = c;
    sfx.play('paka', { rate: 1 - info.index * 0.03 });
    if (info.index >= 3) {
      this.cameras.main.shake(130, 0.005 + (info.index - 3) * 0.004);
      vibrate([20, 30, 40]);
    }

    // 殻が上下に割れて飛ぶ
    const key = c.texture.key;
    const w = c.width;
    const h = c.height;
    const topHalf = this.add.image(x, y, key).setCrop(0, 0, w, h / 2).setDepth(330);
    const bottomHalf = this.add.image(x, y, key).setCrop(0, h / 2, w, h / 2).setDepth(330);
    this.tweens.add({ targets: topHalf, y: y - 80, x: x - 34, rotation: -1.3, alpha: 0, duration: 480, ease: 'Cubic.easeOut', onComplete: () => topHalf.destroy() });
    this.tweens.add({ targets: bottomHalf, y: y + 40, x: x + 28, rotation: 0.9, alpha: 0, duration: 480, ease: 'Cubic.easeOut', onComplete: () => bottomHalf.destroy() });
    this.sparks.setParticleTint(info.color);
    this.sparks.explode(8 + info.index * 8, x, y);

    const prize = this.rollPrize(c.rarity);
    this.removeCapsule(c);
    const stock = stockKey(prize.id, c.shiny);
    s.inventory[stock] = (s.inventory[stock] ?? 0) + 1;
    s.today.opened += 1;
    this.revealItem(prize, x, y, c.shiny);
    this.tutorial('opened');
    this.refreshUI();
    save();
  }

  private rollPrize(r: Rarity): Prize {
    // TODO(Phase 2): 生産終了イベントで排出率を下げる、レリック「目利き」
    const seriesId = weightedPick(adjustedSeriesWeights(S(), this.def.seriesWeights));
    return pick(prizesOf(seriesId, r));
  }

  /** グッズがくるくる回りながら飛び出し、着地して名札が付く */
  private revealItem(p: Prize, x: number, y: number, shiny = false) {
    const info = RARITY_INFO[p.rarity];
    const J = this.jar;
    const n = this.revealing++;
    const cx = Phaser.Math.Clamp(360 + (n % 3) * 50 - 50, 160, 560);
    const cy = Phaser.Math.Clamp((J.top + J.bottom) / 2 + 10, J.top + 160, J.bottom - 130);
    const base = Math.min(0.95, (J.bottom - J.top - 20) / VIEW_H);

    const root = this.add.container(x, y).setDepth(600 + n).setScale(0.15);
    const view = makePrizeView(this, p, { shiny });
    const tag = view.getByName('tag') as Phaser.GameObjects.Container;
    tag.setScale(0);
    root.add(view);

    let rays: Phaser.GameObjects.Image | undefined;
    let cert: Phaser.GameObjects.Container | undefined;
    if (info.index >= 3) rays = this.add.image(cx, cy + ITEM_Y * base, 'rays').setTint(info.color).setDepth(599).setScale(0).setAlpha(0.85);

    const hold = 520 + info.index * 260;
    const spinMs = 520 + info.index * 120;
    const turns = 2 + (info.index >= 3 ? 1 : 0);
    sfx.play('whoosh', { rate: 1.3 });

    this.tweens.chain({
      targets: root,
      tweens: [
        // 放物線で飛び出す（y は途中で上に膨らませる）
        {
          x: cx,
          scale: base,
          duration: 300,
          ease: 'Quad.easeOut',
          onUpdate: (tw) => {
            const t = tw.progress;
            root.y = Phaser.Math.Linear(y, cy, t) - Math.sin(t * Math.PI) * 140;
          },
        },
        // くるくる回る（横向きの回転を scaleX で表現）
        {
          scaleX: base,
          duration: spinMs,
          onUpdate: (tw) => {
            const a = tw.progress * Math.PI * 2 * turns;
            root.scaleX = base * Math.cos(a);
          },
          onStart: () => {
            for (let k = 0; k < turns * 2; k++) this.time.delayedCall((spinMs / (turns * 2)) * k, () => sfx.play('flip', { rate: 1 + k * 0.08, vol: 0.6 }));
          },
          onComplete: () => {
            root.scaleX = base;
            // 着地
            sfx.play('knock', { rate: 0.7 });
            this.tweens.add({ targets: root, scaleY: base * 0.86, duration: 70, yoyo: true });
            this.tweens.add({ targets: tag, scale: 1, duration: 220, ease: 'Back.easeOut', delay: 60 });
            if (info.index >= 2 || shiny) {
              sfx.play('sparkle', { rate: 0.95 + info.index * 0.03 });
              twinkle(this, view, Math.max(2, info.index));
            }
            if (shiny && info.index < 3) stamp(this, cx, cy - 210 * base, '色違い！', 40, CSS.gold, { hold: hold - 150 });
            if (rays) this.tweens.add({ targets: rays, scale: 1.4, rotation: 1, duration: hold + 300 });
            if (info.index >= 3) {
              // 鑑定書つき
              cert = this.makeCertificate(p, cx + 150 * base, cy - 40 * base, base);
              stamp(this, cx, cy - 210 * base, info.index >= 4 ? '超激レア!!' : '激レア!', 40, info.css, { hold: hold - 150 });
              this.confetti.explode(20 + (info.index - 3) * 30, cx, cy);
            }
          },
        },
        // しまう（所持品へ）
        { x: J.right - 74, y: J.top + 34, scale: 0.05, angle: 20, delay: hold, duration: 320, ease: 'Cubic.easeIn' },
      ],
      onComplete: () => {
        root.destroy();
        this.revealing = Math.max(0, this.revealing - 1);
        if (rays) this.tweens.add({ targets: rays, alpha: 0, duration: 200, onComplete: () => rays?.destroy() });
        if (cert) this.tweens.add({ targets: cert, alpha: 0, x: J.right - 74, y: J.top + 34, scale: 0.05, duration: 300, onComplete: () => cert?.destroy() });
        sfx.play('tick', { rate: 1.3 });
        this.tweens.add({ targets: this.invIcon, scale: 1.2, duration: 80, yoyo: true });
      },
    });
  }

  /** SSR 以上に付く鑑定書 */
  private makeCertificate(p: Prize, x: number, y: number, scale: number) {
    const info = RARITY_INFO[p.rarity];
    const c = this.add.container(x + 120, y).setDepth(598).setAngle(14).setScale(scale * 0.8).setAlpha(0);
    const g = this.add.graphics();
    drawPlate(g, -80, -110, 160, 220, PAL.paper, { radius: 6, shadow: 6, outline: 4, shine: false });
    g.lineStyle(3, info.color, 1);
    g.strokeRect(-68, -98, 136, 196);
    c.add(g);
    c.add(txt(this, 0, -72, '鑑定書', 26, { color: CSS.ink }));
    c.add(txt(this, 0, -24, `${p.rarity}\n${KIND_LABEL[p.kind]}`, 22, { color: CSS.inkSoft }));
    c.add(txt(this, 0, 50, '真作', 40, { color: CSS.bad, stroke: CSS.ink, strokeThickness: 4 }).setAngle(-12));
    this.tweens.add({ targets: c, alpha: 1, x, duration: 260, ease: 'Back.easeOut' });
    this.time.delayedCall(200, () => sfx.play('stamp', { vol: 0.7 }));
    return c;
  }

  // ---------- 初回の説明 ----------

  /**
   * 段階：0 回す → 1 開ける → 2 合成と売る → 3 提灯と返済 → 完了。
   * 進み具合はセーブとは別に保存し、やり直しても繰り返さない。
   */
  private tutorial(ev: 'start' | 'pulled' | 'opened' | 'market' | 'wake') {
    const step = loadTutorialStep();
    if (step >= TUTORIAL_DONE || !this.coach) return;
    const at = { x: 360, y: this.machineTop + 70 };
    const firstCapsule = () => {
      const c = this.capsules.find((x) => x.active && !x.busy);
      return c ? { x: c.x, y: c.y - RARITY_INFO[c.rarity].radius - 4 } : null;
    };
    if (step === 0 && ev === 'start') {
      this.coach.say(at, 'よう店主！ まずはオイラのハンドルを\nぐるっと回してみな');
    } else if (step === 0 && ev === 'pulled') {
      saveTutorialStep(1);
      this.coach.say(at, '出てきたカプセルを\nタップして開けてみな', firstCapsule);
    } else if (step === 1 && ev === 'opened') {
      saveTutorialStep(2);
      this.coach.say(at, '同じ色が 3 つくっつくと「色違い」になるぞ。\nスマホを傾けると転がる。振ったら瓶がまざる');
      this.time.delayedCall(4200, () => {
        if (loadTutorialStep() !== 2) return;
        this.coach?.say(at, 'グッズは「売る」でコインに換えな。\n相場は毎日変わる。瓦版の噂も見とけよ', () => ({ x: 128, y: this.btnY - 70 }));
      });
    } else if (step === 2 && ev === 'market') {
      saveTutorialStep(3);
      this.coach.clear();
    } else if (step === 3 && ev === 'wake') {
      saveTutorialStep(TUTORIAL_DONE);
      this.coach.say(at, '提灯（AP）がなくなったら閉店だ。\n7 日ごとに取り立て屋が来る。それまでに稼げ！', () => ({ x: 245, y: Hud.bottom() - 30 }));
      this.time.delayedCall(6000, () => this.coach?.clear());
    }
  }

  // ---------- 瓦版（噂） ----------

  private openKawaraban(onClose?: () => void) {
    this.machine.setInputEnabled(false);
    showKawaraban(this, S().events, S().day, () => {
      this.machine.setInputEnabled(true);
      onClose?.();
    });
  }

  /** 窓に貼った瓦版。タップで今朝の噂を読み直せる */
  private buildKawarabanPin(top: number) {
    const c = this.add.container(70, top + 196).setDepth(95).setAngle(-6);
    const g = this.add.graphics();
    drawPlate(g, -40, -26, 80, 52, 0xefe2c4, { radius: 4, shadow: 4, outline: 3, shine: false });
    g.fillStyle(PAL.blood, 1);
    g.fillRect(-40, -26, 80, 16);
    c.add(g);
    c.add(txt(this, 0, 8, '瓦版', 20, { color: CSS.ink }));
    c.setSize(84, 56).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      sfx.play('tap');
      this.openKawaraban();
    });
    // 新しいニュースがある日は揺れて知らせる
    if (S().events.news.length > 0) this.tweens.add({ targets: c, angle: 6, duration: 300, yoyo: true, repeat: 5 });
  }

  // ---------- 縁起物 ----------

  /** 店の壁に縁起物を飾る（左右の壁に 2×2 ずつ）。タップで効果を表示 */
  private renderRelicShelf() {
    const ids = S().relics;
    const key = ids.join(',');
    if (key === this.shelfKey) return;
    this.shelfKey = key;
    this.relicShelf?.destroy();
    const top = Hud.bottom();
    const slots = [
      [52, top + 268],
      [124, top + 268],
      [52, top + 360],
      [124, top + 360],
      [592, top + 300],
      [664, top + 300],
      [592, top + 392],
      [664, top + 392],
    ];
    const c = this.add.container(0, 0).setDepth(90);
    ids.slice(0, slots.length).forEach((id, i) => {
      const r = RELIC_BY_ID[id];
      if (!r) return;
      const [x, y] = slots[i];
      // 吊るし紐
      const cord = this.add.graphics();
      cord.lineStyle(2, PAL.mustard, 0.8);
      cord.lineBetween(x, y - 52, x, y - 36);
      const img = this.add.image(x, y, omamoriKey(id)).setScale(0.72).setOrigin(0.5, 0.45);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        sfx.play('tap');
        this.tweens.add({ targets: img, angle: { from: -12, to: 0 }, duration: 400, ease: 'Back.easeOut' });
        toast(this, `${r.name}\n${r.description}${r.drawback ? `\nただし：${r.drawback}` : ''}`, this.jar.top + 90);
      });
      this.tweens.add({ targets: img, angle: { from: -3, to: 3 }, duration: 1800 + i * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      c.add([cord, img]);
    });
    // 次に飾る場所に「？」の空き札。タップで入手方法を教える
    if (ids.length < slots.length) {
      const [x, y] = slots[ids.length];
      const g = this.add.graphics();
      g.lineStyle(3, PAL.paper, 0.45);
      g.strokeRoundedRect(x - 26, y - 34, 52, 72, 10);
      const q = txt(this, x, y + 2, '？', 32, { color: CSS.cream }).setAlpha(0.6);
      const hit = this.add.zone(x, y, 64, 84).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        sfx.play('tap');
        toast(this, '縁起物（レリック）の入手方法\n・返済日に取り立て屋の品から 1 つ選べる\n・ガチャからまれに出る「黒いカプセル」', this.jar.top + 90);
      });
      this.tweens.add({ targets: q, alpha: { from: 0.35, to: 0.75 }, duration: 1200, yoyo: true, repeat: -1 });
      c.add([g, q, hit]);
    }
    if (ids.length > slots.length) c.add(txt(this, 628, top + 450, `ほか${ids.length - slots.length}個`, 20, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 4 }));
    this.relicShelf = c;
  }

  /** 黒いカプセル：封じられたカプセルが出て、縁起物を 3 つから 1 つ選べる */
  private blackCapsule() {
    const s = S();
    const out = this.machine.outlet;
    this.machine.react(4);
    this.machine.setInputEnabled(false);
    sfx.play('rumble', { rate: 1.2 });
    this.cameras.main.shake(300, 0.006);
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0).setDepth(2500);
    this.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 500 });
    const cap = this.add.image(out.x, out.y, 'cap_black').setDepth(2600).setScale(0.6);
    const cy = GAME_H / 2;
    stamp(this, 360, cy - 160, '黒いカプセル…!?', 44, CSS.cream, { hold: 900, depth: 2700 });
    this.tweens.chain({
      targets: cap,
      tweens: [
        { x: 360, y: cy, scale: 1.8, duration: 500, ease: 'Back.easeOut' },
        { angle: { from: -8, to: 8 }, duration: 60, yoyo: true, repeat: 7 },
      ],
      onComplete: () => {
        sfx.play('paka', { rate: 0.8 });
        sfx.play('stamp');
        this.sparks.setParticleTint(PAL.mustard);
        this.sparks.explode(30, 360, cy);
        cap.destroy();
        showRelicPicker(this, {
          heading: '縁起物が出てきた！',
          sub: 'ひとつだけ持っていける',
          relics: rollRelics(s, 3, ['common', 'rare']),
          onDone: (r) => {
            if (r) addRelic(s, r.id);
            this.tweens.add({ targets: dim, alpha: 0, duration: 250, onComplete: () => dim.destroy() });
            this.machine.setInputEnabled(true);
            this.refreshUI();
            save();
          },
        });
      },
    });
  }

  // ---------- 行動 ----------

  private explainDenied(kind: 'sell' | 'baito') {
    const s = S();
    if (kind === 'sell' && s.ap >= sellApCost(s) && inventoryCount(s) === 0) {
      toast(this, '売る景品がない！\nカプセルをタップして開けよう', this.jar.top + 90);
    } else {
      toast(this, 'AP（提灯）が足りない…\n今日は閉店しよう', this.jar.top + 90);
    }
  }

  private leaveTo(key: string, data?: object) {
    sfx.play('whoosh');
    this.machine.setInputEnabled(false);
    this.syncJar();
    saveNow();
    this.scene.launch(key, data);
    this.scene.sleep();
  }

  private goMarket() {
    this.tutorial('market');
    const s = S();
    s.ap -= sellApCost(s);
    this.leaveTo('Market');
  }

  private goBaito() {
    this.leaveTo('Baito');
  }

  private closeShop() {
    const s = S();
    const now = this.time.now;
    if (s.ap > 0 && now > this.closeArmedUntil) {
      this.closeArmedUntil = now + 2500;
      toast(this, `提灯（AP）がまだ ${s.ap} つ残っています\nもう一度押すと閉店`, this.jar.top + 90);
      return;
    }
    this.leaveTo('Close');
  }

  private onWake() {
    this.machine.setInputEnabled(true);
    this.closeArmedUntil = 0;
    this.refreshUI();
    if (S().pendingMorning) this.morningBanner();
    else this.tutorial('wake');
  }

  /** 朝の「のれん」：日付と返済日の予告 */
  private morningBanner() {
    const s = S();
    s.pendingMorning = false;
    save();
    const payday = isPayday(s);
    const y = this.jar.top - 120;
    const band = this.add.container(GAME_W / 2, -300).setDepth(800);
    const g = this.add.graphics();
    const col = payday ? PAL.blood : PAL.plum;
    // のれん（3 枚に割れた布）
    for (let i = 0; i < 3; i++) {
      const x = -300 + i * 202;
      drawPlate(g, x, -100, 194, 210, col, { radius: 6, shadow: 6, outline: 5, shine: false });
    }
    g.fillStyle(PAL.woodDark, 1);
    g.fillRoundedRect(-330, -126, 660, 26, 10);
    g.lineStyle(5, PAL.ink, 1);
    g.strokeRoundedRect(-330, -126, 660, 26, 10);
    const t1 = txt(this, 0, -24, `${s.day}日目`, 76, { color: CSS.cream, stroke: CSS.ink, strokeThickness: 10, shadow: true });
    // 高騰中のシリーズがあれば朝いちばんに知らせる
    const hot = SERIES.filter((se) => s.market.series[se.id].trend >= 1.8).map((se) => se.name);
    const sub = payday
      ? `今日は返済日！ 閉店後に ${dueAmount(s).toLocaleString('ja-JP')} 返済`
      : s.events.news.length > 0
        ? s.events.news[0]
        : hot.length > 0
          ? `🔥 ${hot.join('・')} が高騰中！`
        : `第${s.week}週 ・ 返済まで あと${daysUntilPayday(s)}日`;
    const t2 = txt(this, 0, 58, sub, 26, {
      color: payday ? '#ffd9cf' : CSS.cream,
      stroke: CSS.ink,
      strokeThickness: 5,
    });
    band.add([g, t1, t2]);
    sfx.play('whoosh');
    this.tweens.chain({
      targets: band,
      tweens: [
        { y, duration: 380, ease: 'Bounce.easeOut' },
        { y: -320, duration: 300, delay: payday ? 1700 : 1000, ease: 'Cubic.easeIn' },
      ],
      onComplete: () => {
        band.destroy();
        // のれんが上がったら瓦版（噂）→ 夜のうちに化けたカプセル
        this.openKawaraban(() => {
          if (S().nightChanges.length > 0) this.time.delayedCall(200, () => this.playNightChanges());
          this.tutorial('start');
          this.tutorial('wake');
        });
      },
    });
    if (payday) this.time.delayedCall(380, () => sfx.play('rumble', { vol: 0.6 }));
  }

  update() {
    this.applyTilt();
    this.checkClusters();
    this.coach?.update();
    for (const c of this.capsules) {
      c.syncGlow();
      // 瓶の口より上へ飛び出しかけたらブレーキ（まぜる・傾けで飛び出さないように）
      const body = c.body as MatterJS.BodyType | null;
      if (body && !c.busy && c.y < this.jar.top + 10 && body.velocity.y < 0) c.setVelocityY(body.velocity.y * 0.6);
      // 万一すり抜けたら瓶へ戻す
      if (c.y > GAME_H + 20 || c.x < -50 || c.x > GAME_W + 50) {
        c.setPosition(360, this.jar.top + 20);
        c.setVelocity(0, 0);
      }
    }
  }
}
