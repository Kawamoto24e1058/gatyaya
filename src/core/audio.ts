// 効果音はすべてコードで合成する（外部音源素材は使わない）。
// 起動時に AudioBuffer を作っておき、pointerdown から即時に BufferSource で鳴らす。

export type SfxName =
  | 'gari'
  | 'goton'
  | 'pop'
  | 'paka'
  | 'sparkle'
  | 'coin'
  | 'snap'
  | 'buzz'
  | 'reji'
  | 'tick'
  | 'tap'
  | 'fanfare'
  | 'fail'
  | 'whoosh'
  | 'knock'
  | 'charge'
  | 'shutter'
  | 'stamp'
  | 'flip'
  | 'rumble';

type PlayOpts = { rate?: number; vol?: number; delay?: number };

const TAU = Math.PI * 2;
const SR = 44100;
const rnd = () => Math.random() * 2 - 1;

function synth(dur: number, fn: (t: number, i: number) => number): Float32Array {
  const n = Math.ceil(dur * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

function lowpass(data: Float32Array, fc: number): Float32Array {
  const a = 1 - Math.exp((-TAU * fc) / SR);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i] - y);
    data[i] = y;
  }
  return data;
}

function highpass(data: Float32Array, fc: number): Float32Array {
  const a = 1 - Math.exp((-TAU * fc) / SR);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i] - y);
    data[i] = data[i] - y;
  }
  return data;
}

function normalize(data: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < data.length; i++) data[i] *= k;
  }
  // 末尾のプチノイズ防止
  const fade = Math.min(256, data.length);
  for (let i = 0; i < fade; i++) data[data.length - 1 - i] *= i / fade;
  return data;
}

/** 減衰付きの鐘っぽい音 */
function tone(t: number, f: number, decay: number, harmonics: number[] = [1]): number {
  if (t < 0) return 0;
  let s = 0;
  harmonics.forEach((amp, k) => (s += amp * Math.sin(TAU * f * (k + 1) * t)));
  return s * Math.exp(-t * decay) * Math.min(1, t / 0.002);
}

const builders: Record<SfxName, () => Float32Array[]> = {
  // ハンドルのラチェット音「ガリ」。ランダム感を出すため 3 種
  gari: () =>
    [0, 1, 2].map((v) =>
      normalize(
        highpass(
          synth(0.06, (t) =>
            rnd() * Math.exp(-t * 150) * 0.7 +
            Math.sin(TAU * (2400 + v * 350) * t) * Math.exp(-t * 230) * 0.5 +
            Math.sin(TAU * (620 + v * 40) * t) * Math.exp(-t * 90) * 0.6,
          ),
          300,
        ),
        0.85,
      ),
    ),

  // 1 周したときの重い「ゴトン」
  goton: () => {
    let phase = 0;
    let phase2 = 0;
    return [
      normalize(
        lowpass(
          synth(0.75, (t) => {
            const f = 42 + 95 * Math.exp(-t * 16);
            phase += (TAU * f) / SR;
            let s = Math.sin(phase) * Math.exp(-t * 8) * 1.0;
            s += rnd() * Math.exp(-t * 40) * 0.55;
            const t2 = t - 0.17; // 受け皿に落ちる「トン」
            if (t2 > 0) {
              phase2 += (TAU * 170) / SR;
              s += Math.sin(phase2) * Math.exp(-t2 * 28) * 0.45 + rnd() * Math.exp(-t2 * 90) * 0.25;
            }
            const t3 = t - 0.29; // 小さく転がる
            if (t3 > 0) s += Math.sin(TAU * 320 * t3) * Math.exp(-t3 * 50) * 0.12;
            return s;
          }),
          2000,
        ),
      ),
    ];
  },

  // 合体の「ポンッ」
  pop: () => {
    let phase = 0;
    return [
      normalize(
        synth(0.2, (t) => {
          const f = 300 * Math.pow(1150 / 300, Math.min(1, t / 0.07));
          phase += (TAU * f) / SR;
          const env = Math.min(1, t / 0.003) * Math.exp(-t * 20);
          return Math.sin(phase) * env + Math.sin(phase * 2) * env * 0.15 + rnd() * Math.exp(-t * 500) * 0.3;
        }),
      ),
    ];
  },

  // 開封の「パカッ」
  paka: () => [
    normalize(
      synth(0.45, (t) => {
        let s = 0;
        s += rnd() * Math.exp(-t * 420) * 0.9;
        const t2 = t - 0.035;
        if (t2 > 0) s += rnd() * Math.exp(-t2 * 300) * 0.8 + Math.sin(TAU * 900 * t2) * Math.exp(-t2 * 80) * 0.4;
        s += rnd() * Math.exp(-t * 16) * 0.08;
        s += tone(t - 0.04, 1568, 7) * 0.25 + tone(t - 0.04, 2349, 9) * 0.15;
        return s;
      }),
    ),
  ],

  // レア開封のキラキラ
  sparkle: () => [
    normalize(
      synth(1.1, (t) => {
        const notes = [1047, 1319, 1568, 2093, 2637];
        let s = 0;
        notes.forEach((f, k) => (s += tone(t - k * 0.07, f, 6, [1, 0.25])));
        return s * 0.5;
      }),
      0.7,
    ),
  ],

  // 売却の「チャリン」
  coin: () => [
    normalize(
      synth(0.55, (t) => tone(t, 1976, 11, [1, 0.3]) + tone(t - 0.075, 2637, 8, [1, 0.3]) * 1.1),
      0.8,
    ),
  ],

  // カプセル詰めの「パチッ」
  snap: () => [
    normalize(
      highpass(
        synth(0.07, (t) =>
          rnd() * Math.exp(-t * 320) * 0.9 +
          Math.sin(TAU * 2300 * t) * Math.exp(-t * 170) * 0.6 +
          Math.sin(TAU * 480 * t) * Math.exp(-t * 60) * 0.5,
        ),
        200,
      ),
    ),
  ],

  // 失敗・不可の「ブッ」
  buzz: () => [
    normalize(
      lowpass(
        synth(0.22, (t) => {
          const sq = (f: number) => (Math.sin(TAU * f * t) > 0 ? 1 : -1);
          const env = Math.min(1, t / 0.005) * (t < 0.15 ? 1 : Math.exp(-(t - 0.15) * 40));
          return (sq(98) + sq(147) * 0.6) * env;
        }),
        1400,
      ),
      0.6,
    ),
  ],

  // レジ締めの「ガシャ…チーン」
  reji: () => [
    normalize(
      synth(1.6, (t) => {
        let s = 0;
        if (t < 0.14) s += lowpassNoiseSample() * Math.exp(-t * 25) * 0.9;
        s += tone(t - 0.14, 2637, 3.2, [1, 0, 0.3]) * 0.6;
        s += tone(t - 0.14, 2637 * 2.76, 6) * 0.2;
        s += tone(t - 0.14, 3951, 4) * 0.25;
        return s;
      }),
      0.85,
    ),
  ],

  tick: () => [normalize(synth(0.045, (t) => Math.sin(TAU * 1500 * t) * Math.exp(-t * 95)), 0.6)],

  tap: () => [
    normalize(
      synth(0.06, (t) => Math.sin(TAU * 880 * t) * Math.exp(-t * 70) + rnd() * Math.exp(-t * 400) * 0.25),
      0.55,
    ),
  ],

  fanfare: () => [
    normalize(
      synth(1.4, (t) => {
        const seq: [number, number, number][] = [
          [523, 0, 0.12],
          [659, 0.12, 0.12],
          [784, 0.24, 0.12],
          [1047, 0.36, 0.9],
        ];
        let s = 0;
        for (const [f, st, len] of seq) {
          const lt = t - st;
          if (lt < 0) continue;
          const env = Math.min(1, lt / 0.01) * (lt < len ? 1 : Math.exp(-(lt - len) * 12)) * Math.exp(-lt * 1.5);
          s += (Math.sin(TAU * f * lt) + 0.3 * Math.sin(TAU * f * 3 * lt) + 0.15 * Math.sin(TAU * f * 5 * lt)) * env;
        }
        return s;
      }),
      0.7,
    ),
  ],

  fail: () => [
    normalize(
      synth(1.3, (t) => {
        const seq = [392, 370, 349, 330];
        let s = 0;
        seq.forEach((f, k) => {
          const st = k * 0.28;
          const lt = t - st;
          const len = k === 3 ? 0.6 : 0.24;
          if (lt < 0 || lt > len + 0.2) return;
          const vib = 1 + (k === 3 ? 0.012 * Math.sin(TAU * 6 * lt) : 0);
          const env = Math.min(1, lt / 0.01) * (lt < len ? 1 : Math.exp(-(lt - len) * 25));
          const ph = TAU * f * vib * lt;
          s += (2 / Math.PI) * Math.asin(Math.sin(ph)) * env; // 三角波
        });
        return s;
      }),
      0.6,
    ),
  ],

  // 画面遷移のシュッ
  whoosh: () => {
    let y = 0;
    return [
      normalize(
        synth(0.3, (t) => {
          const fc = 300 + 3000 * Math.sin(Math.PI * Math.min(1, t / 0.3));
          const a = 1 - Math.exp((-TAU * fc) / SR);
          y += a * (rnd() - y);
          return y * Math.sin(Math.PI * Math.min(1, t / 0.3));
        }),
        0.4,
      ),
    ];
  },

  // カプセル同士・瓶にぶつかる軽い音
  knock: () =>
    [0, 1].map((v) =>
      normalize(
        lowpass(
          synth(0.08, (t) => Math.sin(TAU * (260 + v * 70) * t) * Math.exp(-t * 55) + rnd() * Math.exp(-t * 220) * 0.4),
          3000,
        ),
        0.5,
      ),
    ),

  // 開封前の溜め（rate を上げながら連打する）
  charge: () => [
    normalize(synth(0.05, (t) => Math.sin(TAU * 1100 * t) * Math.exp(-t * 70) + Math.sin(TAU * 2200 * t) * Math.exp(-t * 120) * 0.3), 0.5),
  ],

  // シャッターが下りる「ガラガラガラ…ガシャン」
  shutter: () => {
    let y = 0;
    return [
      normalize(
        synth(1.1, (t) => {
          let s = 0;
          if (t < 0.85) {
            const rattle = Math.max(0, Math.sin(Math.PI * 2 * 26 * t)) ** 6;
            const a = 1 - Math.exp((-TAU * 900) / SR);
            y += a * (rnd() - y);
            s += y * (0.35 + rattle * 1.4) * Math.min(1, t / 0.05);
          }
          const t2 = t - 0.85;
          if (t2 > 0) s += (rnd() * Math.exp(-t2 * 30) + Math.sin(TAU * 90 * t2) * Math.exp(-t2 * 12)) * 1.2;
          return s;
        }),
        0.8,
      ),
    ];
  },

  // ハンコ「ドン」
  stamp: () => [
    normalize(
      lowpass(
        synth(0.3, (t) => Math.sin(TAU * (70 + 60 * Math.exp(-t * 30)) * t) * Math.exp(-t * 14) + rnd() * Math.exp(-t * 60) * 0.6),
        1500,
      ),
    ),
  ],

  // カードをめくる「シュパッ」
  flip: () => {
    let y = 0;
    return [
      normalize(
        synth(0.16, (t) => {
          const fc = 1500 + 5000 * (t / 0.16);
          const a = 1 - Math.exp((-TAU * fc) / SR);
          y += a * (rnd() - y);
          return y * Math.sin(Math.PI * Math.min(1, t / 0.16)) + (t > 0.12 ? rnd() * Math.exp(-(t - 0.12) * 200) * 0.5 : 0);
        }),
        0.5,
      ),
    ];
  },

  // 取り立て屋の低いうなり
  rumble: () => {
    let ph = 0;
    return [
      normalize(
        lowpass(
          synth(1.6, (t) => {
            ph += (TAU * (48 + 6 * Math.sin(TAU * 0.7 * t))) / SR;
            const env = Math.min(1, t / 0.3) * (t > 1.2 ? Math.exp(-(t - 1.2) * 8) : 1);
            return (Math.sin(ph) + 0.5 * Math.sin(ph * 2.01) + rnd() * 0.15) * env;
          }),
          600,
        ),
        0.8,
      ),
    ];
  },
};

let lpState = 0;
function lowpassNoiseSample(): number {
  lpState += 0.25 * (rnd() - lpState);
  return lpState * 2;
}

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SfxName, AudioBuffer[]>();
  private _muted = false;

  get muted() {
    return this._muted;
  }

  /** 起動直後に呼ぶ。AudioContext は suspended のまま作り、バッファを生成しておく */
  init(): void {
    if (this.ctx) return;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      this.ctx = new Ctor();
    }
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    for (const name of Object.keys(builders) as SfxName[]) {
      const datas = builders[name]();
      this.buffers.set(
        name,
        datas.map((d) => {
          const buf = this.ctx!.createBuffer(1, d.length, SR);
          buf.getChannelData(0).set(d);
          return buf;
        }),
      );
    }

    // iOS はバックグラウンド復帰などで suspended / interrupted に戻るため、毎回の入力で復帰を試みる
    const resume = () => this.unlock();
    window.addEventListener('pointerdown', resume, { capture: true });
    window.addEventListener('touchend', resume, { capture: true });
  }

  /** ユーザー操作の中で呼ぶ（iOS 対策） */
  unlock(): void {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => undefined);
      // 無音を 1 回鳴らして iOS のオーディオを確実に起こす
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, SR);
      src.connect(this.ctx.destination);
      src.start(0);
    }
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  play(name: SfxName, opts: PlayOpts = {}): void {
    if (!this.ctx || !this.master || this._muted) return;
    const list = this.buffers.get(name);
    if (!list || list.length === 0) return;
    const src = this.ctx.createBufferSource();
    src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    src.connect(g);
    g.connect(this.master);
    src.start(this.ctx.currentTime + (opts.delay ?? 0));
  }
}

export const sfx = new SfxEngine();
