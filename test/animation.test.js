import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROWS, BADGE_WIDTH, effectLength, frameInterval, renderFrame } from '../src/preview.js';
import { EFFECT_TICK, MAX_DURATION, buildFrames, effectPeriod, loopDuration, loopLength } from '../src/animation.js';

const bitmap = (width, cols = [0]) => {
  const px = new Array(width * ROWS).fill(0);
  for (const c of cols) for (let y = 0; y < ROWS; y++) px[y * width + c] = 1;
  return { width, px };
};
const total = (frames) => frames.reduce((n, f) => n + f.delay, 0);

test('一巡のコマ数: 横スクロールは幅 + 44、アニメーションは 48 列ごと、効果はページ数倍', () => {
  assert.equal(loopLength(64, 0), 64 + BADGE_WIDTH);
  assert.equal(loopLength(64, 1), 64 + BADGE_WIDTH);
  assert.equal(loopLength(96, 5), 2);
  assert.equal(loopLength(100, 5), 3);
  assert.equal(loopLength(88, 7), effectLength(7) * 2);
  assert.equal(loopLength(88, 2), (ROWS * 2 + 10) * 2);
});

test('固定表示は 1 ページなら動かず、複数ページなら 20 コマずつ切り替わる', () => {
  assert.equal(loopLength(40, 4), 1);
  assert.equal(loopLength(88, 4), 40);
});

test('点滅は 1.2 秒、枠アニメは 0.4 秒で一巡し、両方なら 1.2 秒', () => {
  assert.equal(effectPeriod({ blink: true }), 12 * EFFECT_TICK);
  assert.equal(effectPeriod({ ants: true }), 4 * EFFECT_TICK);
  assert.equal(effectPeriod({ blink: true, ants: true }), 12 * EFFECT_TICK);
  assert.equal(effectPeriod({}), 0);
});

test('GIF の長さはモードの一巡で、点滅があれば両方の周期が揃う長さにする', () => {
  // 速度 3 は 1 コマ 100 ms。一巡 108 コマ（10.8 秒）は 1.2 秒の倍数なので、揃えても上限に収まる
  const base = { bitmap: bitmap(64), mode: 0, speed: 3 };
  const one = loopLength(64, 0) * frameInterval(0, 3);
  assert.equal(loopDuration(base), one);
  const d = loopDuration({ ...base, blink: true });
  assert.equal(d % one, 0);
  assert.equal(d % 1200, 0);
});

test('周期を揃えると長すぎるときは、モードの一巡だけに合わせる', () => {
  // 幅 2000 列・速度 1 の横スクロールは 1 巡で 2044 × 130 ms。1.2 秒と揃えると上限を超える
  const msg = { bitmap: bitmap(2000), mode: 0, speed: 1, blink: true };
  assert.equal(loopDuration(msg), 2044 * 130);
  assert.ok(2044 * 130 * 12 > MAX_DURATION);
});

test('動かない固定表示は 1 コマにまとめ、点滅があれば点灯と消灯の 2 コマになる', () => {
  const still = buildFrames({ bitmap: bitmap(16), mode: 4, speed: 4 });
  assert.equal(still.length, 1);
  const blink = buildFrames({ bitmap: bitmap(16), mode: 4, speed: 4, blink: true });
  assert.deepEqual(blink.map((f) => f.delay), [60, 60]);
  assert.ok(blink[1].grid.every((v) => v === 0));
});

for (const speed of [1, 4, 8]) {
  test(`横スクロール（速度 ${speed}）のコマは、GIF の表示時間の合計がモードの一巡と一致する`, () => {
    const msg = { bitmap: bitmap(24, [0, 5]), mode: 0, speed, ants: true };
    const frames = buildFrames(msg);
    assert.equal(total(frames), Math.round(loopDuration(msg) / 10));
    assert.ok(frames.every((f) => f.delay >= 2), '表示時間は 2/100 秒以上');
  });
}

test('最初のコマはプレビューの最初のコマと同じ画面になる', () => {
  const msg = { bitmap: bitmap(60, [3, 50]), mode: 8, speed: 5 };
  assert.deepEqual(buildFrames(msg)[0].grid, renderFrame(msg.bitmap, 8, 0));
});

test('続けて同じ画面のコマは 1 コマにまとめる', () => {
  const frames = buildFrames({ bitmap: bitmap(88, [1, 50]), mode: 4, speed: 4 });
  assert.equal(frames.length, 2); // 2 ページを 20 コマずつ
  assert.equal(frames[0].delay, Math.round((20 * frameInterval(4, 4)) / 10));
  for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i].grid, frames[i - 1].grid);
});

test('全モードで、どのコマも 44×11 で表示時間は 2/100 秒以上', () => {
  for (let mode = 0; mode <= 8; mode++) for (const speed of [1, 8]) {
    const frames = buildFrames({ bitmap: bitmap(56, [0, 20, 55]), mode, speed, blink: true, ants: true });
    assert.ok(frames.length > 0);
    for (const f of frames) {
      assert.equal(f.grid.length, BADGE_WIDTH * ROWS);
      assert.ok(f.delay >= 2, `mode=${mode} speed=${speed} delay=${f.delay}`);
    }
  }
});
