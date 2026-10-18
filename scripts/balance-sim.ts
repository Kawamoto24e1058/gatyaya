// バランス確認用のシミュレーター：ゲームの計算部分（相場・ガチャ・合成・化ける・返済）をそのまま使い、
// 自動プレイヤーに何千ラン遊ばせて「何週目まで返済できるか」の分布を出す。
// 実行：npm run sim（引数でラン数を指定可：npm run sim -- 5000）
//
// 物理（瓶の中でくっつくか）とバイトの腕前は確率で近似している。
import { BALANCE } from '../src/config';
import { pick, weightedPick } from '../src/core/util';
import { MACHINE_BY_ID } from '../src/data/machines';
import { parseStock, prizesOf, stockKey } from '../src/data/prizes';
import { RARITIES, type Rarity } from '../src/data/rarity';
import { canSell, sellOne, sellPrice } from '../src/game/market';
import { paydayOffer, rollRelics, runHook } from '../src/game/relics';
import { pullRelicGacha, relicGachaPrice } from '../src/game/relicGacha';
import { buyUpgrade, nextUpgradeCost, upAttract, upBaitoMult, upTwinChance, UPGRADES } from '../src/game/upgrades';
import { addRelic, advanceDay, jarCapacity, newGame, payDebt, pullCost, sellApCost, type GameState } from '../src/game/state';

const USE_RELICS = process.env.RELICS !== '0';

const RUNS = Number(process.argv[2] ?? 2000);
// 数値の試し打ち：COST=25 Q0=800 G=1.7 npm run sim
const B = BALANCE as unknown as Record<string, number>;
if (process.env.Q0) B.firstQuota = Number(process.env.Q0);
if (process.env.G) B.quotaGrowth = Number(process.env.G);
if (process.env.COST) MACHINE_BY_ID.hand.cost = Number(process.env.COST);
if (process.env.START) B.startCoins = Number(process.env.START);
const MAX_WEEKS = 8;
const machine = MACHINE_BY_ID.hand;
console.log(`ガチャ ${machine.cost} / 初期 ${BALANCE.startCoins} / ノルマ ${BALANCE.firstQuota} ×${BALANCE.quotaGrowth}`);

// ---- 近似モデル（実機の体感に合わせて調整する） ----
/** バイト 1 回の稼ぎ（観測値 45〜67） */
const baitoCoins = () => 45 + Math.floor(Math.random() * 23);
/** バイトで瓶 +1 の特典を取れる確率 */
const BAITO_BONUS_RATE = 0.6;
/** 同色が 3 つ以上あるとき、その日のうちにくっついて合成される確率（まぜるボタン込み） */
const FUSE_RATE = 0.75;

type Strategy = {
  name: string;
  /** その日の売却で、このキーを売るか */
  shouldSell: (s: GameState, key: string, daysLeft: number) => boolean;
};

const GACHA_RELICS = process.env.RGACHA !== '0';
const USE_UPGRADES = process.env.UPG !== '0';

function pull(s: GameState) {
  const cost = pullCost(s, machine.cost);
  s.coins -= cost;
  s.coins += runHook(s, 'onPullRefund', 0, { cost });
  s.today.pulls += 1;
  s.totals.pulls += 1;
  // 黒いカプセル：縁起物をランダムに 1 つ取る（近似）
  if (USE_RELICS && Math.random() < BALANCE.blackCapsuleRate) {
    const r = rollRelics(s, 3, ['common', 'rare']);
    if (r.length) {
      addRelic(s, pick(r).id);
      return;
    }
  }
  s.jar.push(runHook(s, 'onGachaRoll', weightedPick(machine.rarityWeights)));
  s.jarShiny.push(false);
  // 改装「おまけ玉」
  if (Math.random() < upTwinChance(s) && s.jar.length < jarCapacity(s)) {
    s.jar.push(runHook(s, 'onGachaRoll', weightedPick(machine.rarityWeights)));
    s.jarShiny.push(false);
  }
}

/** 瓶の中で同色 3 つが合成される（近似） */
function fuseJar(s: GameState) {
  for (const r of RARITIES) {
    let idx = s.jar.map((x, i) => (x === r && !s.jarShiny[i] ? i : -1)).filter((i) => i >= 0);
    while (idx.length >= BALANCE.fuseMin && Math.random() < Math.min(0.95, FUSE_RATE + upAttract(s) * 0.06)) {
      const take = idx.slice(0, BALANCE.fuseMin);
      // 後ろから消して 1 つを色違いとして残す
      for (const i of take.slice(1).sort((a, b) => b - a)) {
        s.jar.splice(i, 1);
        s.jarShiny.splice(i, 1);
      }
      s.jarShiny[take[0]] = true;
      s.today.fusions += 1;
      idx = s.jar.map((x, i) => (x === r && !s.jarShiny[i] ? i : -1)).filter((i) => i >= 0);
    }
  }
}

function openAll(s: GameState) {
  s.jar.forEach((r: Rarity, i) => {
    const seriesId = weightedPick(machine.seriesWeights);
    const p = pick(prizesOf(seriesId, r));
    const key = stockKey(p.id, s.jarShiny[i]);
    s.inventory[key] = (s.inventory[key] ?? 0) + 1;
  });
  s.jar = [];
  s.jarShiny = [];
}

function pullAll(s: GameState, reserve: number) {
  while (s.coins - pullCost(s, machine.cost) >= reserve && s.jar.length < jarCapacity(s)) {
    pull(s);
    if (s.jar.length >= jarCapacity(s)) fuseJar(s);
  }
  fuseJar(s);
}

function sellWhere(s: GameState, pred: (key: string) => boolean) {
  for (const key of Object.keys(s.inventory)) {
    if (!canSell(s, key)) continue; // 販売禁止中（闇ルートは使わない近似）
    while ((s.inventory[key] ?? 0) > 0 && pred(key)) {
      // 値崩れで基準の半分を切ったら、その日はやめる
      const { prize } = parseStock(key);
      if (sellPrice(s, key) < prize.basePrice * 0.35) break;
      sellOne(s, key);
    }
  }
}

/** 1 日の行動：バイト 2 回 → 回す → 開ける → 出店 → 売上でもう一度回す（翌日開ける） */
function playDay(s: GameState, st: Strategy): void {
  const daysLeft = (BALANCE.daysPerWeek - (s.day % BALANCE.daysPerWeek)) % BALANCE.daysPerWeek;
  for (let i = 0; i < 2 && s.ap >= BALANCE.apCost.baito; i++) {
    s.ap -= BALANCE.apCost.baito;
    s.coins += Math.round(runHook(s, 'onBaito', baitoCoins()) * upBaitoMult(s));
    if (Math.random() < BAITO_BONUS_RATE) s.jarBonusWeek += 1;
  }
  const payday = daysLeft === 0;
  // 縁起物ガチャ：週の前半、代金の 2.5 倍以上あれば回す（訳ありは半々で持っていく）
  if (USE_RELICS && GACHA_RELICS && daysLeft >= 3 && s.coins >= relicGachaPrice(s) * 2.5) {
    const r = pullRelicGacha(s);
    if (r && (r.rarity !== 'boss' || Math.random() < 0.5)) addRelic(s, r.id);
  }
  // 返済日は、ノルマに届かない分を残して回さない
  const reserve = payday ? s.quota : 0;
  pullAll(s, reserve);
  openAll(s);
  if (s.ap >= sellApCost(s)) {
    s.ap -= sellApCost(s);
    if (payday && s.coins < s.quota) {
      // 返済日：高く売れる順に、ノルマに届くまで売る
      const keys = Object.keys(s.inventory).sort((a, b) => sellPrice(s, b) - sellPrice(s, a));
      for (const k of keys) if (canSell(s, k)) while ((s.inventory[k] ?? 0) > 0 && s.coins < s.quota) sellOne(s, k);
    }
    sellWhere(s, (k) => st.shouldSell(s, k, daysLeft));
  }
  pullAll(s, payday ? s.quota : 0);
  // 夜の改装：返済に必要な分を残して、安いものから買う
  if (USE_UPGRADES && !payday) {
    const keep = s.quota * (daysLeft <= 2 ? 1 : 0.5);
    for (;;) {
      const cands = UPGRADES.map((u) => ({ id: u.id, cost: nextUpgradeCost(s, u.id) })).filter((c) => c.cost !== null && s.coins - c.cost >= keep);
      if (cands.length === 0) break;
      cands.sort((a, b) => a.cost! - b.cost!);
      buyUpgrade(s, cands[0].id);
    }
  }
}

function runOnce(st: Strategy): { weeks: number; coinsAtPayday: number[] } {
  const s = newGame();
  // 特定の縁起物だけを最初から持たせる：FORCE=goldhandle RELICS=0 npm run sim
  if (process.env.FORCE) addRelic(s, process.env.FORCE);
  const coinsAtPayday: number[] = [];
  for (let w = 1; w <= MAX_WEEKS; w++) {
    for (let d = 0; d < BALANCE.daysPerWeek; d++) {
      playDay(s, st);
      if (d === BALANCE.daysPerWeek - 1) {
        coinsAtPayday.push(s.coins / s.quota);
        if (!payDebt(s)) return { weeks: w - 1, coinsAtPayday };
        // 取り立て屋の品：ランダムに 1 つ取る（近似）
        if (USE_RELICS) {
          const offer = paydayOffer(s);
          if (offer.length) addRelic(s, pick(offer).id);
        }
      }
      advanceDay(s);
    }
  }
  return { weeks: MAX_WEEKS, coinsAtPayday };
}

const strategies: Strategy[] = [
  { name: '毎日ぜんぶ売る', shouldSell: () => true },
  {
    name: '相場を読む（×1.3 以上で売る）',
    shouldSell: (s, key, daysLeft) => {
      const sm = s.market.series[parseStock(key).prize.seriesId];
      return sm.trend >= 1.3 || daysLeft <= 1;
    },
  },
];

for (const st of strategies) {
  const hist = new Array(MAX_WEEKS + 1).fill(0);
  const ratio: number[][] = Array.from({ length: MAX_WEEKS }, () => []);
  for (let i = 0; i < RUNS; i++) {
    const r = runOnce(st);
    hist[r.weeks]++;
    r.coinsAtPayday.forEach((v, w) => ratio[w].push(v));
  }
  const cleared = hist.slice(BALANCE.weeksPerTown).reduce((a, b) => a + b, 0);
  console.log(`\n■ ${st.name}（${RUNS} ラン）  ${BALANCE.weeksPerTown} 週完済 ${((cleared / RUNS) * 100).toFixed(0)}%`);
  let reach = RUNS;
  for (let w = 1; w <= MAX_WEEKS; w++) {
    if (w >= 2) reach -= hist[w - 2];
    const ok = reach - hist[w - 1];
    const rs = ratio[w - 1].sort((a, b) => a - b);
    const med = rs.length ? rs[Math.floor(rs.length / 2)] : 0;
    const quota = Math.round(B.firstQuota * B.quotaGrowth ** (w - 1));
    console.log(
      `  第${w}週 返済 ${String(quota).padStart(6)}：返済成功 ${((ok / RUNS) * 100).toFixed(0).padStart(3)}%  返済日の所持/ノルマ 中央値 ×${med.toFixed(2)}`,
    );
    if (ok <= 0) break;
  }
}
