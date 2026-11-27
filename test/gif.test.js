import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GifWriter, encodeGif, lzw } from '../src/gif.js';

// テスト用の GIF デコーダ。エンコーダとは別の書き方（仕様どおりの素直な実装）で、往復して同じ画像に戻ることを確かめる。
function lzwDecode(data, minCode, count) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, dict = [], prev = null, pos = 0;
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = null; dict[eoi] = null; size = minCode + 1; prev = null; };
  const read = () => { let v = 0; for (let i = 0; i < size; i++, pos++) v |= ((data[pos >> 3] >> (pos & 7)) & 1) << i; return v; };
  reset();
  const out = [];
  while (pos + size <= data.length * 8) {
    const code = read();
    if (code === clear) { reset(); continue; }
    if (code === eoi) break;
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (code === dict.length && prev) entry = [...prev, prev[0]];
    else throw new Error(`不正なコード ${code}`);
    out.push(...entry);
    if (prev && dict.length < 4096) dict.push([...prev, entry[0]]);
    if (dict.length === 1 << size && size < 12) size++;
    prev = entry;
  }
  assert.equal(out.length, count, '展開したピクセル数');
  return out;
}

function decodeGif(buf) {
  let p = 0;
  const u8 = () => buf[p++], u16 = () => { const v = buf[p] | (buf[p + 1] << 8); p += 2; return v; };
  const ascii = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8()); return s; };
  const blocks = () => { const a = []; for (let n = u8(); n; n = u8()) { a.push(...buf.subarray(p, p + n)); p += n; } return Uint8Array.from(a); };
  assert.equal(ascii(6), 'GIF89a');
  const width = u16(), height = u16(), flags = u8(); u8(); u8();
  assert.ok(flags & 0x80, 'グローバルパレットがある');
  const palSize = 2 << (flags & 7), palette = [];
  for (let i = 0; i < palSize; i++) palette.push([u8(), u8(), u8()]);
  const canvas = new Uint8Array(width * height), frames = [];
  let delay = 0, loop = null;
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      if (label === 0xf9) { u8(); const f = u8(); delay = u16(); u8(); assert.equal((f >> 2) & 7, 1, '処理方法は 1（残す）'); }
      else if (label === 0xff) { const n = u8(); const id = ascii(n); const d = blocks(); if (id === 'NETSCAPE2.0') loop = d[1] | (d[2] << 8); continue; }
      else { blocks(); continue; }
      assert.equal(u8(), 0);
      continue;
    }
    assert.equal(b, 0x2c);
    const x = u16(), y = u16(), w = u16(), h = u16();
    assert.equal(u8(), 0, 'ローカルパレットなし');
    const minCode = u8();
    const px = lzwDecode(blocks(), minCode, w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) canvas[(y + j) * width + x + i] = px[j * w + i];
    frames.push({ pixels: Uint8Array.from(canvas), delay, rect: { x, y, w, h } });
  }
  assert.equal(p, buf.length, 'Trailer で終わる');
  return { width, height, palette, frames, loop };
}

const pal3 = [[0, 0, 0], [10, 20, 30], [255, 70, 40]];

test('1 コマの GIF を往復すると、同じ大きさ・パレット・ピクセルに戻る', () => {
  const pixels = Uint8Array.from({ length: 7 * 5 }, (_, i) => i % 3);
  const g = decodeGif(encodeGif({ width: 7, height: 5, palette: pal3, frames: [{ pixels, delay: 10 }] }));
  assert.equal(g.width, 7);
  assert.equal(g.height, 5);
  // 3 色のパレットは 2 の累乗の 4 色に広げ、空きは黒で埋める
  assert.deepEqual(g.palette, [...pal3, [0, 0, 0]]);
  assert.deepEqual(g.frames[0].pixels, pixels);
  assert.equal(g.frames[0].delay, 10);
});

test('無限ループ（NETSCAPE2.0 の回数 0）を書く', () => {
  const g = decodeGif(encodeGif({ width: 1, height: 1, palette: pal3, frames: [{ pixels: [0], delay: 5 }] }));
  assert.equal(g.loop, 0);
});

test('2 コマ目以降は変わった範囲だけを書き、重ねると元のコマになる', () => {
  const a = new Uint8Array(10 * 6), b = Uint8Array.from(a), c = Uint8Array.from(a);
  b[2 * 10 + 3] = 2; b[4 * 10 + 6] = 1; // (3,2) と (6,4)
  c.set(b); c[0] = 1;
  const g = decodeGif(encodeGif({ width: 10, height: 6, palette: pal3, frames: [a, b, c].map((pixels) => ({ pixels, delay: 3 })) }));
  assert.deepEqual(g.frames[1].rect, { x: 3, y: 2, w: 4, h: 3 });
  assert.deepEqual(g.frames.map((f) => f.pixels), [a, b, c]);
});

test('変わらないコマも表示時間を保つため 1 コマとして書く', () => {
  const a = new Uint8Array(4);
  const g = decodeGif(encodeGif({ width: 2, height: 2, palette: pal3, frames: [{ pixels: a, delay: 2 }, { pixels: a, delay: 7 }] }));
  assert.deepEqual(g.frames.map((f) => f.delay), [2, 7]);
});

test('辞書が 4096 を超える大きな画像（256 色）も往復できる', () => {
  // 疑似乱数で圧縮しにくい画像にし、コード長の増加と clear を何度も通す
  let s = 1;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s; };
  const palette = Array.from({ length: 256 }, (_, i) => [i, 255 - i, i]);
  const pixels = Uint8Array.from({ length: 200 * 150 }, () => rnd() % 256);
  const g = decodeGif(encodeGif({ width: 200, height: 150, palette, frames: [{ pixels, delay: 4 }] }));
  assert.deepEqual(g.frames[0].pixels, pixels);
});

test('2 色の画像でも最小コード長は 2 にする', () => {
  const data = lzw(Uint8Array.from([0, 1, 1, 0]), 2);
  assert.deepEqual(lzwDecode(data, 2, 4), [0, 1, 1, 0]);
  const g = decodeGif(encodeGif({ width: 2, height: 2, palette: [[0, 0, 0], [255, 255, 255]], frames: [{ pixels: [0, 1, 1, 0], delay: 1 }] }));
  assert.deepEqual([...g.frames[0].pixels], [0, 1, 1, 0]);
});

test('同じ色が長く続く画像も往復できる（辞書の再利用が続く場合）', () => {
  const pixels = new Uint8Array(300 * 300);
  pixels.fill(1, 1000, 80000);
  const g = decodeGif(encodeGif({ width: 300, height: 300, palette: pal3, frames: [{ pixels, delay: 4 }] }));
  assert.deepEqual(g.frames[0].pixels, pixels);
});

test('大きさやパレット・コマが不正なら RangeError にする', () => {
  const ok = { width: 2, height: 2, palette: pal3, frames: [{ pixels: new Uint8Array(4), delay: 1 }] };
  assert.throws(() => encodeGif({ ...ok, width: 0 }), RangeError);
  assert.throws(() => encodeGif({ ...ok, palette: [[0, 0, 0]] }), RangeError);
  assert.throws(() => encodeGif({ ...ok, palette: Array(257).fill([0, 0, 0]) }), RangeError);
  assert.throws(() => encodeGif({ ...ok, frames: [] }), RangeError);
  assert.throws(() => encodeGif({ ...ok, frames: [{ pixels: new Uint8Array(3), delay: 1 }] }), RangeError);
});

test('GifWriter に 1 コマずつ足しても、まとめて渡したときと同じ GIF になる', () => {
  const pal = pal3, a = new Uint8Array(12), b = Uint8Array.from(a);
  b[5] = 2;
  const w = new GifWriter({ width: 4, height: 3, palette: pal });
  // 同じ配列を書き換えて使い回しても、差分は前に渡した内容と比べる
  const buf = Uint8Array.from(a);
  w.addFrame(buf, 4);
  buf.set(b);
  w.addFrame(buf, 6);
  assert.deepEqual(w.finish(), encodeGif({ width: 4, height: 3, palette: pal, frames: [{ pixels: a, delay: 4 }, { pixels: b, delay: 6 }] }));
});

test('コマを 1 つも足さずに GifWriter を終えると RangeError にする', () => {
  assert.throws(() => new GifWriter({ width: 1, height: 1, palette: pal3 }).finish(), RangeError);
});
