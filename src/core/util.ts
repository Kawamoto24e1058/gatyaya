// 小物ユーティリティ

/** 重み付き抽選 */
export function weightedPick<K extends string>(weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

export function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 標準正規乱数（Box-Muller） */
export function gauss(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** インフレしても読める表記（万・億・兆…） */
export function fmt(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(Math.round(n));
  const units: [number, string][] = [
    [1e16, '京'],
    [1e12, '兆'],
    [1e8, '億'],
    [1e4, '万'],
  ];
  for (const [v, u] of units) {
    if (a >= v * 10) {
      const x = a / v;
      return sign + (x >= 1000 ? Math.floor(x).toLocaleString('ja-JP') : x.toFixed(x >= 100 ? 0 : 1)) + u;
    }
  }
  return sign + a.toLocaleString('ja-JP');
}

/** Android のみ任意で振動。iOS Safari は非対応なので音・揺れ・パーティクルで代替する */
export function vibrate(ms: number | number[]): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* noop */
  }
}
