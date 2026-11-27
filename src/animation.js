// 表示モードの動きを、GIF に入れる「コマと表示時間」の並びにする。
// プレビューと同じく、モードのコマは frameInterval ごと、点滅と枠アニメは EFFECT_TICK ごとに進む。
// DOM に依存させず、Node.js でテストできるようにしている。
import {
  ROWS, BADGE_WIDTH, ANIMATION_FRAME_WIDTH, effectLength, frameInterval, pageCount, renderFrame, applyBlinkAndAnts,
} from './preview.js';

/** 点滅と枠アニメが 1 段進む間隔（ミリ秒）。モードの速さに連動させない（led-name-badge と同じ）。 */
export const EFFECT_TICK = 100;
/** GIF の長さの上限（ミリ秒）。点滅と動きの周期を揃えるために繰り返すとき、これを超えるなら揃えない。 */
export const MAX_DURATION = 60000;
// 多くのブラウザは 1/100 秒単位の表示時間が 2 未満のコマを 10 として扱い、極端に遅く再生するため、2 以上にする。
const MIN_DELAY_CS = 2;

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;

/**
 * モードの動きが一巡するまでのコマ数。1 なら動かない（固定表示で 1 ページだけのとき）。
 * @param {number} width ビットマップの幅
 * @param {number} mode 0〜8
 */
export function loopLength(width, mode) {
  const m = Number(mode), pages = pageCount(width);
  if (m === 0 || m === 1) return width + BADGE_WIDTH;
  if (m === 5) return Math.max(1, Math.ceil(width / ANIMATION_FRAME_WIDTH));
  if (m === 2 || m === 3) return (ROWS * 2 + 10) * pages;
  if (effectLength(m)) return effectLength(m) * pages;
  return pages === 1 ? 1 : 20 * pages;
}

/**
 * 点滅・枠アニメが一巡する時間（ミリ秒）。どちらもなければ 0。
 * 点滅は 6 段ごとに切り替わる（12 段で一巡）、枠アニメは 4 段で一巡する（preview.js の applyBlinkAndAnts）。
 */
export function effectPeriod({ blink, ants }) {
  if (blink) return 12 * EFFECT_TICK; // 枠アニメの周期（4 段）は 12 段の約数なので、両方あっても 12 段
  if (ants) return 4 * EFFECT_TICK;
  return 0;
}

/**
 * GIF の長さ（ミリ秒）。モードの一巡と、点滅・枠アニメの一巡の両方が切れ目なくつながる長さにする。
 * 揃えると MAX_DURATION を超えるときは、モードの一巡だけに合わせる（点滅などはループの継ぎ目でずれる）。
 */
export function loopDuration(msg) {
  const interval = frameInterval(msg.mode, msg.speed);
  const len = loopLength(msg.bitmap.width, msg.mode);
  const period = effectPeriod(msg);
  if (len === 1) return period || interval; // 動かないなら、点滅などの一巡だけでよい
  const base = len * interval;
  if (!period) return base;
  const aligned = lcm(base, period);
  return aligned <= MAX_DURATION ? aligned : base;
}

/**
 * GIF に入れるコマの並びを作る。画面が変わる時刻ごとに 1 コマにし、同じ画面が続くコマはまとめる。
 * @param {{ bitmap: { width: number, px: ArrayLike<number> }, mode: number, speed: number, blink?: boolean, ants?: boolean }} msg
 * @returns {{ grid: Uint8Array, delay: number }[]} grid は 44×11 の点灯状態、delay は表示時間（1/100 秒）
 */
export function buildFrames(msg) {
  const interval = frameInterval(msg.mode, msg.speed);
  const duration = loopDuration(msg);
  const hasEffect = effectPeriod(msg) > 0;

  // 画面が変わりうる時刻: モードのコマの切り替わりと、点滅・枠アニメの切り替わり
  const times = new Set();
  for (let t = 0; t < duration; t += interval) times.add(t);
  if (hasEffect) for (let t = 0; t < duration; t += EFFECT_TICK) times.add(t);
  const sorted = [...times].sort((a, b) => a - b);

  const frames = [];
  let start = 0; // 次のコマの開始（1/100 秒）。表示時間の丸めの誤差が積もらないよう、時刻から毎回丸める
  sorted.forEach((t, i) => {
    const end = Math.round((i + 1 < sorted.length ? sorted[i + 1] : duration) / 10);
    // 短すぎるコマは出さず、その時間を次のコマに回す（最後のコマは前のコマにまとめる）
    if (end - start < MIN_DELAY_CS && i + 1 < sorted.length) return;
    const grid = applyBlinkAndAnts(
      renderFrame(msg.bitmap, msg.mode, Math.floor(t / interval)), msg, Math.floor(t / EFFECT_TICK),
    );
    const last = frames[frames.length - 1];
    if (last && (end - start < MIN_DELAY_CS || sameGrid(last.grid, grid))) last.delay += end - start;
    else frames.push({ grid, delay: end - start });
    start = end;
  });
  return frames;
}

function sameGrid(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
