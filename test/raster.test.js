import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROWS, BADGE_WIDTH } from '../src/preview.js';
import { BG, OFF, ON, COLORS, layout, palette, rasterize } from '../src/raster.js';

const grid = (fn) => Uint8Array.from({ length: BADGE_WIDTH * ROWS }, (_, i) => (fn(i % BADGE_WIDTH, Math.floor(i / BADGE_WIDTH)) ? 1 : 0));

test('バナーの形は 44×11 個の LED と、LED 半個分の余白の大きさになる', () => {
  const lay = layout({ dot: 10 });
  assert.equal(lay.width, 44 * 10 + 10);
  assert.equal(lay.height, 11 * 10 + 10);
  assert.equal(lay.left, 5);
  assert.equal(lay.top, 5);
});

test('16:9 の形は横幅をそのままに高さを広げ、バナーを上下の中央に置く', () => {
  const lay = layout({ dot: 12, shape: 'wide' });
  assert.equal(lay.height, Math.round((lay.width * 9) / 16));
  assert.ok(Math.abs(lay.top * 2 + ROWS * 12 - lay.height) <= 1);
});

test('LED の一辺は 2 ピクセル未満にしない', () => {
  assert.equal(layout({ dot: 0 }).dot, 2);
  assert.equal(layout({ dot: 1.7 }).dot, 2);
});

test('点灯している LED の中心は ON、消灯は OFF、LED の間と余白は背景になる', () => {
  const lay = layout({ dot: 10 });
  const img = rasterize(grid((x, y) => x === 0 && y === 0), lay);
  const at = (x, y) => img[y * lay.width + x];
  assert.equal(at(lay.left + 5, lay.top + 5), ON); // 左上の LED の中心
  assert.equal(at(lay.left + 15, lay.top + 5), OFF); // 右隣の LED の中心
  assert.equal(at(lay.left, lay.top), BG); // LED の角（丸の外）
  assert.equal(at(0, 0), BG); // 余白
  assert.equal(img.length, lay.width * lay.height);
});

test('使う色は背景・消灯・点灯の 3 色だけ', () => {
  const img = rasterize(grid((x, y) => (x + y) % 3 === 0), layout({ dot: 9, shape: 'wide' }));
  assert.deepEqual([...new Set(img)].sort(), [BG, OFF, ON]);
});

test('パレットは [背景, 消灯, 点灯] で、明るさを下げると点灯の色だけが暗くなる', () => {
  const full = palette('green', 100), dim = palette('green', 25);
  assert.equal(full.length, 3);
  assert.deepEqual(full[0], [0, 0, 0]);
  assert.deepEqual(full[2], COLORS.green.rgb);
  assert.deepEqual(dim[1], full[1]);
  assert.ok(dim[2][1] < full[2][1] && dim[2][1] > full[1][1]);
});

test('知らない色は赤にする', () => {
  assert.deepEqual(palette('purple'), palette('red'));
});
