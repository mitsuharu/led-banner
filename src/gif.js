// アニメーション GIF（GIF89a）のエンコーダ。外部ライブラリを使わないため自前で持つ。
// 仕様: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
// DOM に依存させず、Node.js でテストできるようにしている。

/**
 * パレットの番号で描いたコマの並びを、アニメーション GIF にする。
 * @param {{
 *   width: number, height: number,
 *   palette: number[][],                              // [[r, g, b], ...]、2〜256 色
 *   frames: { pixels: ArrayLike<number>, delay: number }[], // pixels は width × height のパレットの番号、delay は 1/100 秒
 *   loop?: number,                                    // 繰り返す回数。0 は無限
 * }} options
 * @returns {Uint8Array}
 */
export function encodeGif({ frames, ...options }) {
  if (!frames.length) throw new RangeError('コマがありません');
  const w = new GifWriter(options);
  for (const f of frames) w.addFrame(f.pixels, f.delay);
  return w.finish();
}

/**
 * コマを 1 つずつ足していく GIF のエンコーダ。
 * 全コマの画像を先に作ると、長いスクロールでは数十 MB になりスマートフォンで苦しいため、1 コマずつ受け取る。
 * 2 コマ目以降は前のコマから変わった範囲だけを書き、ファイルを小さくする。
 */
export class GifWriter {
  /** @param {{ width: number, height: number, palette: number[][], loop?: number }} options */
  constructor({ width, height, palette, loop = 0 }) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 0xffff || height > 0xffff) {
      throw new RangeError(`画像の大きさが不正です（${width}×${height}）`);
    }
    if (palette.length < 2 || palette.length > 256) throw new RangeError(`パレットは 2〜256 色にしてください（${palette.length}）`);
    this.width = width; this.height = height;
    this.prev = null; this.count = 0;
    // パレットの大きさは 2 の累乗でなければならないため、足りない分は黒で埋める
    let bits = 1;
    while (1 << bits < palette.length) bits++;
    this.bits = bits;
    const out = this.out = new ByteWriter();

    out.ascii('GIF89a');
    out.u16(width); out.u16(height);
    out.byte(0x80 | ((bits - 1) << 4) | (bits - 1)); // グローバルパレットあり・色の深さ・大きさ
    out.byte(0); out.byte(0); // 背景色の番号・縦横比
    for (let i = 0; i < 1 << bits; i++) {
      const c = palette[i] || [0, 0, 0];
      out.byte(c[0]); out.byte(c[1]); out.byte(c[2]);
    }
    // NETSCAPE2.0 拡張。これがないとブラウザは 1 回だけ再生して止まる
    out.bytes([0x21, 0xff, 0x0b]); out.ascii('NETSCAPE2.0');
    out.bytes([0x03, 0x01]); out.u16(loop); out.byte(0);
  }

  /**
   * @param {ArrayLike<number>} pixels width × height のパレットの番号
   * @param {number} delay 表示時間（1/100 秒）
   */
  addFrame(pixels, delay) {
    const { width, height, out } = this;
    if (pixels.length !== width * height) throw new RangeError('コマの大きさが画像と合いません');
    const box = this.prev ? changedBox(this.prev, pixels, width, height) : { x: 0, y: 0, w: width, h: height };
    // 何も変わらないコマも、表示時間を保つため 1×1 で書く（まとめるのは呼び出し側の役目）
    const { x, y, w, h } = box || { x: 0, y: 0, w: 1, h: 1 };
    // Graphic Control Extension。処理方法 1（前のコマを残す）で、変わった範囲だけを重ねる
    out.bytes([0x21, 0xf9, 0x04, 1 << 2]); out.u16(Math.max(0, Math.round(delay))); out.bytes([0, 0]);
    // Image Descriptor（ローカルパレットなし・インターレースなし）
    out.byte(0x2c); out.u16(x); out.u16(y); out.u16(w); out.u16(h); out.byte(0);
    const sub = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) sub[j * w + i] = pixels[(y + j) * width + x + i];
    // 最小コード長は 2 以上と決まっている（2 色でも 2）
    const minCode = Math.max(2, this.bits);
    out.byte(minCode);
    out.subBlocks(lzw(sub, minCode));
    // 呼び出し側が同じ配列を使い回しても差分を正しく取れるよう、写しを持つ
    this.prev = Uint8Array.from(pixels);
    this.count++;
  }

  /** @returns {Uint8Array} */
  finish() {
    if (!this.count) throw new RangeError('コマがありません');
    this.out.byte(0x3b); // Trailer
    return this.out.result();
  }
}

// 前のコマから変わったピクセルを囲む矩形。変わっていなければ null。
function changedBox(a, b, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (a[row + x] !== b[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * GIF の可変長 LZW で圧縮する。
 * @param {Uint8Array} pixels パレットの番号
 * @param {number} minCode 最小コード長
 * @returns {Uint8Array}
 */
export function lzw(pixels, minCode) {
  const clear = 1 << minCode, eoi = clear + 1, alphabet = 1 << minCode;
  // 辞書は「直前の文字列のコード × 色数 + 次の色」を添字にした表。Map より速く、色数が少ないので小さい
  const dict = new Int16Array(4096 * alphabet);
  const bw = new BitWriter();
  let next, size;
  const reset = () => { dict.fill(-1); next = eoi + 1; size = minCode + 1; };

  reset();
  bw.write(clear, size);
  if (!pixels.length) { bw.write(eoi, size); return bw.result(); }
  let cur = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = cur * alphabet + k;
    const found = dict[key];
    if (found >= 0) { cur = found; continue; }
    bw.write(cur, size);
    if (next < 4096) {
      dict[key] = next++;
      // デコーダは次のコードを読む前に辞書へ追加するため、追加した数が 2^size を超えた時点で 1 ビット増やす
      if (next > 1 << size && size < 12) size++;
    } else {
      // 辞書がいっぱいになったら作り直す（12 ビットのまま続けるより、圧縮率が落ちにくい）
      bw.write(clear, size);
      reset();
    }
    cur = k;
  }
  bw.write(cur, size);
  bw.write(eoi, size);
  return bw.result();
}

// LSB から詰めるビット列（GIF の LZW の並び順）。
class BitWriter {
  constructor() { this.buf = []; this.acc = 0; this.n = 0; }
  write(code, size) {
    this.acc |= code << this.n;
    this.n += size;
    while (this.n >= 8) { this.buf.push(this.acc & 0xff); this.acc >>>= 8; this.n -= 8; }
  }
  result() {
    if (this.n > 0) this.buf.push(this.acc & 0xff);
    return Uint8Array.from(this.buf);
  }
}

class ByteWriter {
  constructor() { this.chunks = []; this.cur = []; }
  byte(v) { this.cur.push(v & 0xff); }
  bytes(a) { for (const v of a) this.cur.push(v & 0xff); }
  u16(v) { this.cur.push(v & 0xff, (v >> 8) & 0xff); }
  ascii(s) { for (const c of s) this.cur.push(c.charCodeAt(0)); }
  // データを最大 255 バイトずつのサブブロックに分け、長さ 0 のブロックで終える
  subBlocks(data) {
    this.flush();
    const blocks = new Uint8Array(data.length + Math.ceil(data.length / 255) + 1);
    let o = 0;
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      blocks[o++] = n;
      blocks.set(data.subarray(i, i + n), o);
      o += n;
    }
    blocks[o] = 0;
    this.chunks.push(blocks);
  }
  flush() { if (this.cur.length) { this.chunks.push(Uint8Array.from(this.cur)); this.cur = []; } }
  result() {
    this.flush();
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}
