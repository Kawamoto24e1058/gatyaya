// 瓶の合成の組み分け（物理に依存しない部分）

type P = { x: number; y: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * つながった同色カプセルを n 個ずつの組に分ける。
 * 群れの中心に近い順に使い、n で割り切れない余りは使わない（瓶に残す）。
 */
export function planFusion<T extends P>(chain: T[], n: number): T[][] {
  const sets = Math.floor(chain.length / n);
  if (sets === 0) return [];
  const mx = chain.reduce((a, c) => a + c.x, 0) / chain.length;
  const my = chain.reduce((a, c) => a + c.y, 0) / chain.length;
  const center = { x: mx, y: my };
  const rest = [...chain].sort((a, b) => dist(a, center) - dist(b, center)).slice(0, sets * n);
  const groups: T[][] = [];
  while (rest.length) {
    // 外側から順に、近いものどうしで組にする
    rest.sort((a, b) => dist(b, center) - dist(a, center));
    const head = rest.shift()!;
    rest.sort((a, b) => dist(a, head) - dist(b, head));
    groups.push([head, ...rest.splice(0, n - 1)]);
  }
  return groups;
}
