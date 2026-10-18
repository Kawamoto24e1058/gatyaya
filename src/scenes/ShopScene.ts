// メイン画面：ガチャ機・カプセルの瓶・行動ボタン。演出の強さは常にガチャが最大。
import Phaser from 'phaser';
import { BALANCE, CSS, GAME_W } from '../config';
import { sfx } from '../core/audio';
import { pick, vibrate, weightedPick } from '../core/util';
import { MACHINE_BY_ID, type GachaMachineDef } from '../data/machines';
import { prizesOf, SERIES_BY_ID, type Prize } from '../data/prizes';
import { nextRarity, RARITY_INFO, type Rarity } from '../data/rarity';
import { Capsule } from '../game/Capsule';
import { runHook } from '../game/relics';
import { inventoryCount, isPayday, jarCapacity, S, save, saveNow } from '../game/state';
import { createMachineView, type MachineView } from '../machines/types';
import '../machines/HandCrankMachine';
import { Hud } from '../ui/Hud';
import { Button, floatText, toast, txt } from '../ui/widgets';

const JAR = { left: 56, right: 664, top: 704, bottom: 1110 };
const INV_POS = { x: 650, y: 728 };

type MatterBody = MatterJS.BodyType & { gameObject?: unknown };

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
  private emptyHint!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastMergeAt = 0;
  private mergeCombo = 0;
  private lastKnockAt = 0;
  private closeArmedUntil = 0;

  constructor() {
    super('Shop');
  }

  create() {
    // シーン再起動時にフィールドが残るのでリセット
    this.capsules = [];
    this.mergeQueue = [];
    this.mergeCombo = 0;
    this.closeArmedUntil = 0;

    this.drawBackground();
    this.buildJar();

    this.def = MACHINE_BY_ID[S().machineId];
    this.machine = createMachineView(this, this.def, {
      canPull: () => this.canPull(),
      onPull: () => this.pull(),
      onDenied: (reason) => toast(this, reason, 760, CSS.gold),
    });

    this.hud = new Hud(this);

    this.sparks = this.add.particles(0, 0, 'spark', {
      emitting: false,
      speed: { min: 120, max: 420 },
      scale: { start: 0.9, end: 0 },
      rotate: { min: 0, max: 360 },
      lifespan: { min: 350, max: 700 },
      gravityY: 500,
      blendMode: Phaser.BlendModes.ADD,
    });
    this.sparks.setDepth(400);

    this.buildButtons();

    // 保存済みのカプセルを上から降らせる
    S().jar.forEach((r, i) => {
      this.time.delayedCall(i * 70, () => {
        this.spawnCapsule(Phaser.Math.Between(JAR.left + 60, JAR.right - 60), JAR.top - 10, r, 0, 2);
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

  private drawBackground() {
    const g = this.add.graphics();
    g.fillStyle(0x3a2a5e, 1);
    g.fillRect(0, 0, GAME_W, 1280);
    // 壁のストライプ
    g.fillStyle(0xffffff, 0.035);
    for (let x = 0; x < GAME_W; x += 80) g.fillRect(x, 0, 40, 700);
    // 床
    g.fillStyle(0x241a3c, 1);
    g.fillRect(0, 690, GAME_W, 590);
    g.fillStyle(0xffffff, 0.05);
    g.fillRect(0, 690, GAME_W, 6);
  }

  private buildJar() {
    const g = this.add.graphics().setDepth(50);
    g.fillStyle(0xffffff, 0.07);
    g.fillRoundedRect(JAR.left - 8, JAR.top - 4, JAR.right - JAR.left + 16, JAR.bottom - JAR.top + 12, 34);
    g.lineStyle(6, 0xffffff, 0.45);
    g.strokeRoundedRect(JAR.left - 8, JAR.top - 4, JAR.right - JAR.left + 16, JAR.bottom - JAR.top + 12, 34);
    const front = this.add.graphics().setDepth(210);
    front.fillStyle(0xffffff, 0.08);
    front.fillRoundedRect(JAR.left + 6, JAR.top + 20, 22, JAR.bottom - JAR.top - 60, 11);

    const opts = { isStatic: true, friction: 0.1, restitution: 0.2 };
    const t = 40;
    this.matter.add.rectangle((JAR.left + JAR.right) / 2, JAR.bottom + t / 2, JAR.right - JAR.left + t * 2, t, opts);
    // 側壁は上方向へ高く伸ばし、カプセルがこぼれないようにする（見えない部分あり）
    const wallH = JAR.bottom - 380;
    this.matter.add.rectangle(JAR.left - t / 2, JAR.bottom - wallH / 2, t, wallH, opts);
    this.matter.add.rectangle(JAR.right + t / 2, JAR.bottom - wallH / 2, t, wallH, opts);

    this.jarLabel = txt(this, JAR.left + 18, INV_POS.y, '', 24, { originX: 0, color: CSS.sub }).setDepth(220);
    this.invLabel = txt(this, INV_POS.x, INV_POS.y, '', 24, { originX: 1, color: CSS.cream }).setDepth(220);
    this.emptyHint = txt(this, 360, 920, 'ハンドルを回してカプセルを出そう\n出たカプセルはタップで開封\n同じ色がぶつかると合体！', 26, {
      color: CSS.sub,
      bold: false,
    }).setDepth(60);
  }

  private buildButtons() {
    const y = 1196;
    this.btnSell = new Button(this, 128, y, {
      w: 214,
      h: 116,
      color: 0x4fd18b,
      label: '売りに行く',
      sub: `${BALANCE.apCost.sell}AP`,
      size: 32,
      onPress: () => this.goMarket(),
      onDenied: () => this.explainDenied('sell'),
    });
    this.btnBaito = new Button(this, 360, y, {
      w: 214,
      h: 116,
      color: 0x5ec8ff,
      label: 'バイト',
      sub: `${BALANCE.apCost.baito}AP`,
      size: 32,
      onPress: () => this.goBaito(),
      onDenied: () => this.explainDenied('baito'),
    });
    this.btnClose = new Button(this, 592, y, {
      w: 214,
      h: 116,
      color: 0xff5a7a,
      label: '閉店',
      sub: '今日を終える',
      size: 32,
      onPress: () => this.closeShop(),
    });
    // TODO(Phase 3): 町を移動する（1AP）
    // TODO(Phase 2): 町の掲示板（噂）
  }

  private refreshUI(animateHud = true) {
    const s = S();
    this.hud.refresh(animateHud);
    this.jarLabel.setText(`瓶 ${this.capsules.length}/${jarCapacity(s)}`);
    this.jarLabel.setColor(this.capsules.length >= jarCapacity(s) ? CSS.bad : CSS.sub);
    this.invLabel.setText(`🎁 所持 ${inventoryCount(s)}`);
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
    this.spawnCapsule(out.x + Phaser.Math.Between(-6, 6), out.y, rarity, Phaser.Math.FloatBetween(-1.4, 1.4), 3);
    this.noteBest(rarity);

    floatText(this, 520, 70, `-${this.def.cost}`, CSS.bad, 26);
    const info = RARITY_INFO[rarity];
    if (info.index >= 2) {
      // レア排出：光と音を重ねる
      sfx.play('sparkle', { delay: 0.12, rate: 1 + (info.index - 2) * 0.06 });
      const flash = this.add
        .image(out.x, out.y - 10, 'glow')
        .setTint(info.color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(350)
        .setScale(0.5);
      this.tweens.add({ targets: flash, scale: 2.6 + info.index * 0.4, alpha: 0, duration: 520, onComplete: () => flash.destroy() });
      if (info.index >= 4) this.cameras.main.flash(180, 255, 220, 255);
    }
    this.refreshUI();
    save();
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
      this.spawnCapsule(x, y, target, 0, -4);
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
      scale: (info.radius * 2 * 2.8) / 128,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.sparks.setParticleTint(info.color);
    this.sparks.explode(10 + info.index * 4, x, y);
    if (this.mergeCombo >= 1) floatText(this, x, y - 40, `連鎖×${this.mergeCombo + 1}`, CSS.gold, 26);
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
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(319)
      .setAlpha(0)
      .setScale(0.4);
    this.tweens.add({ targets: glow, alpha: 0.9, scale: 1.0 + info.index * 0.35, duration: charge, ease: 'Quad.easeIn' });

    // 溜め：揺れ幅と光が徐々に増える
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: charge,
      onUpdate: (tw) => {
        const p = tw.getValue() ?? 0;
        const k = p * p;
        c.setPosition(x0 + Math.sin(p * 60) * amp * k, y0 - k * (4 + info.index * 4));
        c.setRotation(Math.sin(p * 47) * 0.12 * k * (1 + info.index * 0.3));
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
    if (info.index >= 2) sfx.play('sparkle', { rate: 0.95 + info.index * 0.03 });
    if (info.index >= 3) {
      this.cameras.main.shake(130, 0.005 + (info.index - 3) * 0.004);
      vibrate([20, 30, 40]);
    }
    if (info.index >= 4) this.cameras.main.flash(250, 255, 240, 200);

    // 殻が上下に割れて飛ぶ
    const key = c.texture.key;
    const w = c.width;
    const h = c.height;
    const top = this.add.image(x, y, key).setCrop(0, 0, w, h / 2).setDepth(330);
    const bottom = this.add.image(x, y, key).setCrop(0, h / 2, w, h / 2).setDepth(330);
    this.tweens.add({ targets: top, y: y - 70, x: x - 30, rotation: -1.2, alpha: 0, duration: 450, ease: 'Cubic.easeOut', onComplete: () => top.destroy() });
    this.tweens.add({ targets: bottom, y: y + 40, x: x + 26, rotation: 0.9, alpha: 0, duration: 450, ease: 'Cubic.easeOut', onComplete: () => bottom.destroy() });
    this.sparks.setParticleTint(info.color);
    this.sparks.explode(8 + info.index * 10, x, y);

    const prize = this.rollPrize(c.rarity);
    this.removeCapsule(c);
    s.inventory[prize.id] = (s.inventory[prize.id] ?? 0) + 1;
    s.today.opened += 1;
    this.showPrizeCard(prize, x, y);
    this.refreshUI();
    save();
  }

  private rollPrize(r: Rarity): Prize {
    // TODO(Phase 2): 生産終了イベントで排出率を下げる、レリック「目利き」
    const seriesId = weightedPick(this.def.seriesWeights);
    return pick(prizesOf(seriesId, r));
  }

  private showPrizeCard(p: Prize, x: number, y: number) {
    const series = SERIES_BY_ID[p.seriesId];
    const info = RARITY_INFO[p.rarity];
    const cx = Phaser.Math.Clamp(x, 170, GAME_W - 170);
    const cy = Phaser.Math.Clamp(y - 130, 800, 1000);
    const card = this.add.container(x, y).setDepth(600).setScale(0.1);
    const g = this.add.graphics();
    const W = 300;
    const H = 170;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-W / 2, -H / 2 + 8, W, H, 22);
    g.fillStyle(0xfff6e6, 1);
    g.fillRoundedRect(-W / 2, -H / 2, W, H, 22);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(series.color).color, 1);
    g.fillRoundedRect(-W / 2, -H / 2, W, 46, { tl: 22, tr: 22, bl: 0, br: 0 });
    g.lineStyle(5, info.color, 1);
    g.strokeRoundedRect(-W / 2, -H / 2, W, H, 22);
    const sn = txt(this, -W / 2 + 18, -H / 2 + 23, series.name, 22, { originX: 0, color: CSS.white, stroke: '#2a1f45', strokeThickness: 4 });
    const badge = txt(this, W / 2 - 16, -H / 2 + 23, p.rarity, 26, { originX: 1, color: info.css, stroke: '#2a1f45', strokeThickness: 6 });
    const name = txt(this, 0, 22, p.name, p.name.length > 9 ? 26 : 32, { color: CSS.ink, wrap: W - 30 });
    card.add([g, sn, badge, name]);

    if (info.index >= 3) {
      const halo = this.add.image(0, 0, 'glow').setTint(info.color).setBlendMode(Phaser.BlendModes.ADD).setScale(4).setAlpha(0.7);
      card.addAt(halo, 0);
      this.tweens.add({ targets: halo, rotation: Math.PI, duration: 2000 });
    }

    const hold = 650 + info.index * 220;
    this.tweens.add({ targets: card, x: cx, y: cy, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: card,
      x: INV_POS.x - 60,
      y: INV_POS.y,
      scale: 0.08,
      alpha: 0.4,
      delay: 260 + hold,
      duration: 320,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        card.destroy();
        sfx.play('tick', { rate: 1.3 });
        this.tweens.add({ targets: this.invLabel, scale: 1.25, duration: 80, yoyo: true });
      },
    });
  }

  // ---------- 行動 ----------

  private explainDenied(kind: 'sell' | 'baito') {
    const s = S();
    if (kind === 'sell' && s.ap >= BALANCE.apCost.sell && inventoryCount(s) === 0) {
      toast(this, '売る景品がない！\nカプセルをタップして開けよう', 760, CSS.gold);
    } else {
      toast(this, 'AP が足りない…今日は閉店しよう', 760, CSS.gold);
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
      toast(this, `AP が ${s.ap} 残っています\nもう一度押すと閉店`, 760, CSS.gold);
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

  private morningBanner() {
    const s = S();
    s.pendingMorning = false;
    save();
    const payday = isPayday(s);
    const band = this.add.container(-GAME_W, 600).setDepth(800);
    const g = this.add.graphics();
    g.fillStyle(payday ? 0xff5a5a : 0x1b1430, 0.92);
    g.fillRect(-GAME_W / 2, -90, GAME_W, 180);
    const t1 = txt(this, 0, -30, `${s.day}日目`, 64, { color: CSS.white });
    const t2 = txt(this, 0, 44, payday ? `今日は返済日！ 閉店後に ${s.quota.toLocaleString('ja-JP')} 返済` : `第${s.week}週 ・ 返済 ${s.quota.toLocaleString('ja-JP')}`, 26, {
      color: payday ? CSS.white : CSS.sub,
    });
    band.add([g, t1, t2]);
    sfx.play('whoosh');
    this.tweens.chain({
      targets: band,
      tweens: [
        { x: GAME_W / 2, duration: 280, ease: 'Cubic.easeOut' },
        { x: GAME_W * 1.5, duration: 260, delay: payday ? 1600 : 900, ease: 'Cubic.easeIn' },
      ],
      onComplete: () => band.destroy(),
    });
  }

  update() {
    this.processMerges();
    for (const c of this.capsules) {
      c.syncGlow();
      // 万一すり抜けたら瓶へ戻す
      if (c.y > 1300 || c.x < -50 || c.x > GAME_W + 50) {
        c.setPosition(360, JAR.top - 20);
        c.setVelocity(0, 0);
      }
    }
  }
}
