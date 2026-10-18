// メイン画面：ガチャ機・カプセルの瓶・行動ボタン。演出の強さは常にガチャが最大。
import Phaser from 'phaser';
import { BALANCE, BOTTOM, CSS, EXTRA_H, GAME_H, GAME_W, PAL } from '../config';
import { sfx } from '../core/audio';
import { pick, vibrate, weightedPick } from '../core/util';
import { MACHINE_BY_ID, type GachaMachineDef } from '../data/machines';
import { prizesOf, type Prize } from '../data/prizes';
import { nextRarity, RARITY_INFO, type Rarity } from '../data/rarity';
import { Capsule } from '../game/Capsule';
import { runHook } from '../game/relics';
import { daysUntilPayday, inventoryCount, isPayday, jarCapacity, S, save, saveNow } from '../game/state';
import { createMachineView, type MachineView } from '../machines/types';
import '../machines/HandCrankMachine';
import { addDust, addLantern, addPeekingEyes, addWisps } from '../ui/Ambient';
import { paintShopBg } from '../ui/art';
import { Hud } from '../ui/Hud';
import { makePrizeCard, shine } from '../ui/PrizeCard';
import { canvasTex } from '../ui/textures';
import { Button, drawPlate, floatText, stamp, toast, txt } from '../ui/widgets';

type MatterBody = MatterJS.BodyType & { gameObject?: unknown };

const BTN_H = 112;

export class ShopScene extends Phaser.Scene {
  private hud!: Hud;
  private machine!: MachineView;
  private def!: GachaMachineDef;
  private capsules: Capsule[] = [];
  private mergeQueue: [Capsule, Capsule][] = [];
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
  private lastMergeAt = 0;
  private mergeCombo = 0;
  private lastKnockAt = 0;
  private closeArmedUntil = 0;
  private revealing = 0;

  constructor() {
    super('Shop');
  }

  create() {
    // シーン再起動時にフィールドが残るのでリセット
    this.capsules = [];
    this.mergeQueue = [];
    this.mergeCombo = 0;
    this.closeArmedUntil = 0;
    this.revealing = 0;

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

    // 保存済みのカプセルを上から降らせる
    S().jar.forEach((r, i) => {
      this.time.delayedCall(i * 70, () => {
        this.spawnCapsule(Phaser.Math.Between(this.jar.left + 60, this.jar.right - 60), this.jar.top + 10, r, 0, 2);
      });
    });

    this.matter.world.on('collisionstart', this.onCollision, this);
    this.matter.world.on('collisionactive', this.onCollisionActive, this);

    this.events.on(Phaser.Scenes.Events.WAKE, this.onWake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.WAKE, this.onWake, this);
      this.machine.destroy();
    });

    this.refreshUI(false);
    if (S().pendingMorning) this.morningBanner();
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

    this.emptyHint = txt(this, 360, (J.top + J.bottom) / 2 + 20, 'ハンドルを回してカプセルを出そう\nカプセルはタップで開封\n同じ色がぶつかると合体！', 26, {
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
      sub: `出店 ${BALANCE.apCost.sell}AP`,
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
    this.emptyHint.setVisible(this.capsules.length === 0 && s.totals.pulls < 3);
    this.btnSell.setEnabled(s.ap >= BALANCE.apCost.sell && inventoryCount(s) > 0);
    this.btnBaito.setEnabled(s.ap >= BALANCE.apCost.baito);
    this.btnClose.setPulse(s.ap === 0);
  }

  // ---------- ガチャ ----------

  private canPull(): true | string {
    const s = S();
    if (s.coins < this.def.cost) return 'コインが足りない…\n景品を売るかバイトで稼ごう';
    if (this.capsules.length >= jarCapacity(s)) return '瓶がいっぱい！\nタップで開けるか、合体させて空けよう';
    return true;
  }

  private pull() {
    const s = S();
    s.coins -= this.def.cost;
    s.today.pulls += 1;
    s.today.gachaSpent += this.def.cost;
    s.totals.pulls += 1;

    const rolled = weightedPick(this.def.rarityWeights);
    const rarity = runHook(s, 'onGachaRoll', rolled, { machineId: this.def.id });
    const out = this.machine.outlet;
    const c = this.spawnCapsule(out.x + Phaser.Math.Between(-6, 6), out.y, rarity, Phaser.Math.FloatBetween(-1.4, 1.4), 3);
    // 飛び出しのスクワッシュ
    c.setScale(0.75);
    this.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.noteBest(rarity);

    const ct = this.hud.coinTarget();
    floatText(this, ct.x + 120, ct.y + 30, `-${this.def.cost}`, CSS.bad, 26);
    this.rareDispenseFx(rarity, out.x, out.y);
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

  private spawnCapsule(x: number, y: number, r: Rarity, vx = 0, vy = 0): Capsule {
    const c = new Capsule(this, x, y, r);
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
    S().jar = this.capsules.map((c) => c.rarity);
  }

  // ---------- 合体 ----------

  private capsulePair(pair: Phaser.Types.Physics.Matter.MatterCollisionPair): [Capsule, Capsule] | null {
    const a = (pair.bodyA as MatterBody).gameObject;
    const b = (pair.bodyB as MatterBody).gameObject;
    if (a instanceof Capsule && b instanceof Capsule) return [a, b];
    return null;
  }

  private tryQueueMerge(a: Capsule, b: Capsule) {
    if (a.rarity !== b.rarity || a.busy || b.busy) return;
    if (!nextRarity(a.rarity)) return; // UR は最大
    this.mergeQueue.push([a, b]);
  }

  private onCollision(ev: Phaser.Physics.Matter.Events.CollisionStartEvent) {
    const now = this.time.now;
    for (const pair of ev.pairs) {
      const caps = this.capsulePair(pair);
      if (caps) this.tryQueueMerge(caps[0], caps[1]);
      // ぶつかった音（強さに応じて）
      const va = pair.bodyA.velocity;
      const vb = pair.bodyB.velocity;
      const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
      if (rel > 2.5 && now - this.lastKnockAt > 45) {
        this.lastKnockAt = now;
        sfx.play('knock', { vol: Math.min(1, rel / 12) * 0.7, rate: 0.9 + Math.random() * 0.25 });
      }
    }
  }

  private onCollisionActive(ev: Phaser.Physics.Matter.Events.CollisionActiveEvent) {
    for (const pair of ev.pairs) {
      const caps = this.capsulePair(pair);
      if (caps) this.tryQueueMerge(caps[0], caps[1]);
    }
  }

  private processMerges() {
    if (this.mergeQueue.length === 0) return;
    const queue = this.mergeQueue;
    this.mergeQueue = [];
    for (const [a, b] of queue) {
      if (!a.active || !b.active || a.busy || b.busy || a.rarity !== b.rarity) continue;
      const nr = nextRarity(a.rarity);
      if (!nr) continue;
      const target = runHook<Rarity>(S(), 'onMerge', nr, { from: a.rarity });
      a.busy = b.busy = true;
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      this.removeCapsule(a);
      this.removeCapsule(b);
      const c = this.spawnCapsule(x, y, target, 0, -4);
      c.setScale(0.6);
      this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.mergeFx(x, y, target);
      const s = S();
      s.today.merges += 1;
      s.totals.merges += 1;
      this.noteBest(target);
    }
    this.refreshUI();
    save();
  }

  private mergeFx(x: number, y: number, r: Rarity) {
    const info = RARITY_INFO[r];
    const now = this.time.now;
    this.mergeCombo = now - this.lastMergeAt < 700 ? this.mergeCombo + 1 : 0;
    this.lastMergeAt = now;
    sfx.play('pop', { rate: 0.85 + info.index * 0.12 + Math.min(this.mergeCombo, 8) * 0.06 });
    vibrate(12);
    const ring = this.add.image(x, y, 'ring').setTint(info.color).setDepth(300).setScale((info.radius * 2) / 128);
    this.tweens.add({
      targets: ring,
      scale: (info.radius * 2 * 2.6) / 128,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.sparks.setParticleTint(info.color);
    this.sparks.explode(8 + info.index * 4, x, y);
    const label = this.mergeCombo >= 1 ? `${this.mergeCombo + 1}連合体！` : '合体！';
    stamp(this, x, y - 56, label, 28 + Math.min(this.mergeCombo, 4) * 4, CSS.cream, { hold: 350, angle: Phaser.Math.Between(-12, 12), depth: 450 });
    if (info.index >= 3) {
      // 合体で SSR / UR が生まれたらガチャ並みに祝う
      stamp(this, x, y - 110, `${r}誕生!!`, 40, info.css, { hold: 700 });
      this.confetti.explode(24, x, y);
      sfx.play('sparkle', { delay: 0.08 });
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
    s.inventory[prize.id] = (s.inventory[prize.id] ?? 0) + 1;
    s.today.opened += 1;
    this.revealCard(prize, x, y);
    this.refreshUI();
    save();
  }

  private rollPrize(r: Rarity): Prize {
    // TODO(Phase 2): 生産終了イベントで排出率を下げる、レリック「目利き」
    const seriesId = weightedPick(this.def.seriesWeights);
    return pick(prizesOf(seriesId, r));
  }

  /** トレカの裏面が飛び出し、くるっとめくれて表になる */
  private revealCard(p: Prize, x: number, y: number) {
    const info = RARITY_INFO[p.rarity];
    const J = this.jar;
    const n = this.revealing++;
    const cx = Phaser.Math.Clamp(360 + (n % 3) * 40 - 40, 160, 560);
    const cy = Phaser.Math.Clamp((J.top + J.bottom) / 2 - 10, J.top + 150, J.bottom - 120);
    const baseScale = Math.min(0.88, (J.bottom - J.top - 30) / 336);

    const root = this.add.container(x, y).setDepth(600 + n).setScale(0.15);
    const back = this.add.image(0, 0, 'card_back');
    const front = makePrizeCard(this, p).setVisible(false);
    root.add([back, front]);

    let rays: Phaser.GameObjects.Image | undefined;
    if (info.index >= 3) {
      rays = this.add.image(cx, cy, 'rays').setTint(info.color).setDepth(599).setScale(0).setAlpha(0.85);
    }

    const hold = 520 + info.index * 260;
    sfx.play('flip', { rate: 0.9 });
    this.tweens.chain({
      targets: root,
      tweens: [
        { x: cx, y: cy, scale: baseScale, angle: { from: -40, to: 0 }, duration: 260, ease: 'Back.easeOut' },
        // めくる
        {
          scaleX: 0,
          duration: 110 + info.index * 40,
          ease: 'Quad.easeIn',
          onComplete: () => {
            back.setVisible(false);
            front.setVisible(true);
            sfx.play('flip', { rate: 1.2 });
            if (info.index >= 2) {
              sfx.play('sparkle', { rate: 0.95 + info.index * 0.03 });
              this.time.delayedCall(10, () => shine(this, root));
            }
            if (rays) this.tweens.add({ targets: rays, scale: 1.4, rotation: 1, duration: hold + 200 });
            if (info.index >= 3) {
              stamp(this, cx, cy - 170 * baseScale, info.index >= 4 ? '超激レア!!' : '激レア!', 40, info.css, { hold: hold - 200 });
              this.confetti.explode(20 + (info.index - 3) * 30, cx, cy);
            }
          },
        },
        { scaleX: baseScale, duration: 130, ease: 'Back.easeOut' },
        // しまう（所持品へ）
        {
          x: J.right - 74,
          y: J.top + 34,
          scale: 0.06,
          angle: 20,
          delay: hold,
          duration: 320,
          ease: 'Cubic.easeIn',
        },
      ],
      onComplete: () => {
        root.destroy();
        this.revealing = Math.max(0, this.revealing - 1);
        if (rays) this.tweens.add({ targets: rays, alpha: 0, duration: 200, onComplete: () => rays?.destroy() });
        sfx.play('tick', { rate: 1.3 });
        this.tweens.add({ targets: this.invIcon, scale: 1.2, duration: 80, yoyo: true });
      },
    });
  }

  // ---------- 行動 ----------

  private explainDenied(kind: 'sell' | 'baito') {
    const s = S();
    if (kind === 'sell' && s.ap >= BALANCE.apCost.sell && inventoryCount(s) === 0) {
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
    const s = S();
    s.ap -= BALANCE.apCost.sell;
    this.leaveTo('Market');
  }

  private goBaito() {
    this.leaveTo('Baito', { id: 'capsule-fill' });
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
    const t2 = txt(this, 0, 58, payday ? `今日は返済日！ 閉店後に ${s.quota.toLocaleString('ja-JP')} 返済` : `第${s.week}週 ・ 返済まで あと${daysUntilPayday(s)}日`, 26, {
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
      onComplete: () => band.destroy(),
    });
    if (payday) this.time.delayedCall(380, () => sfx.play('rumble', { vol: 0.6 }));
  }

  update() {
    this.processMerges();
    for (const c of this.capsules) {
      c.syncGlow();
      // 万一すり抜けたら瓶へ戻す
      if (c.y > GAME_H + 20 || c.x < -50 || c.x > GAME_W + 50) {
        c.setPosition(360, this.jar.top + 20);
        c.setVelocity(0, 0);
      }
    }
  }
}
