// スマホの傾き（瓶のカプセルを転がす）と、振る動作（瓶をまぜる）。
// iOS は「動きと方向」の許可が必要で、ユーザー操作（タップ）の中で requestPermission を呼ぶ必要がある。
// PC など使えない環境では x = 0 のまま（← → キーで代用）。

type Listener = () => void;

export const tilt = {
  /** 左右の傾き（-1〜1） */
  x: 0,
  /** センサーが使えるか */
  active: false,
  onShake: null as Listener | null,
};

let started = false;
let lastShake = 0;

function onOrientation(e: DeviceOrientationEvent) {
  if (e.gamma == null) return;
  tilt.active = true;
  // 30° 傾けると最大。少しだけなめらかにする
  const target = Math.max(-1, Math.min(1, e.gamma / 30));
  tilt.x = tilt.x * 0.6 + target * 0.4;
}

function onMotion(e: DeviceMotionEvent) {
  const a = e.acceleration ?? e.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null || a.z == null) return;
  const g = e.acceleration ? 0 : 9.8;
  const mag = Math.abs(Math.hypot(a.x, a.y, a.z) - g);
  const now = performance.now();
  if (mag > 14 && now - lastShake > 700) {
    lastShake = now;
    tilt.onShake?.();
  }
}

function listen() {
  if (started) return;
  started = true;
  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);
}

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** タップの中で呼ぶ。iOS は許可ダイアログが出る */
export function enableTilt(): void {
  if (started || typeof window === 'undefined') return;
  const DO = (window as unknown as { DeviceOrientationEvent?: PermissionApi }).DeviceOrientationEvent;
  const DM = (window as unknown as { DeviceMotionEvent?: PermissionApi }).DeviceMotionEvent;
  if (DO?.requestPermission) {
    Promise.all([DO.requestPermission(), DM?.requestPermission?.() ?? Promise.resolve('granted')])
      .then(([o]) => {
        if (o === 'granted') listen();
      })
      .catch(() => undefined);
  } else {
    listen();
  }
}

/** iOS では Phaser の pointerdown（touchstart）では許可を求められないため、ネイティブの touchend / click で一度だけ呼ぶ */
export function enableTiltOnFirstGesture(): void {
  if (typeof window === 'undefined') return;
  const once = () => {
    window.removeEventListener('touchend', once, true);
    window.removeEventListener('click', once, true);
    enableTilt();
  };
  window.addEventListener('touchend', once, true);
  window.addEventListener('click', once, true);
}
