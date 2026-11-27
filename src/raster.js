// 44×11 の点灯状態を、丸い LED が並んだ画像（パレットの番号の配列）にする。
// プレビューの canvas と GIF の両方をこの関数で描き、画面と保存した GIF の見た目を一致させる。
// canvas の arc で描かないのは、アンチエイリアスで色数が増え、GIF の 256 色に収まらなくなるため。
// DOM に依存させず、Node.js でテストできるようにしている。
import { ROWS, BADGE_WIDTH } from './preview.js';

/** パレットの番号。 */
export const BG = 0; // 背景
export const OFF = 1; // 消灯している LED
export const ON = 2; // 点灯している LED

/** LED の色。実際のバッジの色の種類（赤・青・黄・緑・白・橙・ピンク）に合わせている。 */
export const COLORS = Object.freeze({
  red: { label: '赤', rgb: [255, 70, 40] },
  orange: { label: '橙', rgb: [255, 140, 20] },
  yellow: { label: '黄', rgb: [255, 220, 40] },
  green: { label: '緑', rgb: [60, 230, 90] },
  blue: { label: '青', rgb: [50, 130, 255] },
  white: { label: '白', rgb: [245, 245, 255] },
  pink: { label: 'ピンク', rgb: [255, 90, 180] },
});

/** 画像の形。banner はバナーだけ、wide は X のタイムラインで切り取られにくい 16:9 にする（上下に余白）。 */
export const SHAPES = Object.freeze(['banner', 'wide']);

/**
 * パレット（[背景, 消灯, 点灯] の RGB）を作る。
 * @param {string} color COLORS のキー。知らない値は赤にする
 * @param {number} brightness 25 / 50 / 75 / 100（%）
 * @returns {number[][]}
 */
export function palette(color, brightness = 100) {
  const rgb = (COLORS[color] || COLORS.red).rgb;
  // 消灯中の LED も、実機のようにうっすら色が分かるようにする
  const off = rgb.map((v) => Math.round(v * 0.1));
  // 明るさ 25% でも見えなくならないよう、0.35〜1 の範囲で弱める（led-name-badge のプレビューと同じ割合）
  const b = Math.min(Math.max(Number(brightness) || 100, 25), 100) / 100;
  const k = 0.35 + 0.65 * b;
  const on = rgb.map((v, i) => Math.round(off[i] + (v - off[i]) * k));
  return [[0, 0, 0], off, on];
}

/**
 * 画像の大きさとバナーの位置を決める。
 * @param {{ dot: number, shape?: string }} options dot は LED 1 個分の一辺（ピクセル）
 */
export function layout({ dot, shape = 'banner' }) {
  const d = Math.max(2, Math.trunc(dot) || 2);
  // 外周に LED 半個分の余白を取り、ふちの LED が画像の端に接して見えないようにする
  const margin = Math.ceil(d / 2);
  const width = BADGE_WIDTH * d + margin * 2;
  const bannerH = ROWS * d + margin * 2;
  const height = shape === 'wide' ? Math.max(bannerH, Math.round((width * 9) / 16)) : bannerH;
  return { dot: d, width, height, left: margin, top: Math.floor((height - ROWS * d) / 2) };
}

// LED 1 個分の丸の形。true のピクセルを LED の色で塗る。
function dotMask(d) {
  const mask = new Uint8Array(d * d);
  const c = d / 2, r = d * 0.4;
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    if (dx * dx + dy * dy <= r * r) mask[y * d + x] = 1;
  }
  return mask;
}

/**
 * 点灯状態を画像にする。
 * @param {ArrayLike<number>} grid 44×11、行優先、0 以外が点灯
 * @param {ReturnType<typeof layout>} lay
 * @returns {Uint8Array} lay.width × lay.height、行優先、各要素はパレットの番号（BG / OFF / ON）
 */
export function rasterize(grid, lay) {
  const { dot: d, width, height, left, top } = lay;
  const out = new Uint8Array(width * height); // BG = 0 で埋まっている
  const mask = dotMask(d);
  for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < BADGE_WIDTH; gx++) {
    const v = grid[gy * BADGE_WIDTH + gx] ? ON : OFF;
    const ox = left + gx * d, oy = top + gy * d;
    for (let y = 0; y < d; y++) {
      const row = (oy + y) * width + ox;
      for (let x = 0; x < d; x++) if (mask[y * d + x]) out[row + x] = v;
    }
  }
  return out;
}
