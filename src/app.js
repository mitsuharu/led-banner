// 画面の操作・文字の描画・プレビュー。動きの計算は preview.js、ドットの描画は raster.js に任せる。
import { ROWS, BADGE_WIDTH as BADGE_W, ANIMATION_FRAME_WIDTH, APPROXIMATE_MODES, frameInterval, renderFrame, applyBlinkAndAnts } from './preview.js';
import { COLORS, layout, palette, rasterize } from './raster.js';

const STORE_KEY = 'ledbanner.v1';

const $ = (id) => document.getElementById(id);

// ---------- state ----------
const defaults = () => ({
  text: 'HELLO', mode: 0, speed: 4, blink: false, ants: false,
  font: $('font').options[0].value, size: 11, yoff: 0, threshold: 110, bold: false, spacing: 0,
  color: 'red', brightness: 100,
  bitmap: null, // { width, px: number[] } row-major, 1 = on
});

let state = load() || (() => { const s = defaults(); s.bitmap = renderText(s); return s; })();

// 保存された内容が壊れていても画面が動かなくならないよう、形が合わない値は初期値に戻す。
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved || typeof saved !== 'object') return null;
    const s = { ...defaults(), ...saved };
    const bm = s.bitmap;
    const valid = bm && Number.isInteger(bm.width) && bm.width > 0 && bm.width % 8 === 0
      && Array.isArray(bm.px) && bm.px.length === bm.width * ROWS;
    if (!valid) s.bitmap = renderText(s);
    if (!COLORS[s.color]) s.color = 'red';
    s.brightness = [25, 50, 75, 100].includes(s.brightness) ? s.brightness : 100;
    return s;
  } catch {
    return null;
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

// ---------- text -> bitmap ----------
function renderText(m) {
  const font = `${m.bold ? 'bold ' : ''}${m.size}px ${m.font}`;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = font;
  const chars = Array.from(m.text || '');
  const advs = chars.map((c) => meas.measureText(c).width);
  const total = Math.ceil(advs.reduce((a, b) => a + b + Number(m.spacing), 0));
  const width = Math.max(8, Math.ceil(Math.max(total, 1) / 8) * 8);

  const cv = document.createElement('canvas');
  cv.width = width; cv.height = ROWS;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  let x = 0;
  chars.forEach((c, i) => { ctx.fillText(c, Math.round(x), ROWS / 2 + 0.5 + Number(m.yoff)); x += advs[i] + Number(m.spacing); });

  const data = ctx.getImageData(0, 0, width, ROWS).data;
  const px = new Array(width * ROWS);
  for (let i = 0; i < px.length; i++) px[i] = data[i * 4 + 3] >= m.threshold ? 1 : 0;
  return { width, px };
}

// ---------- form ----------
const fields = ['text', 'mode', 'speed', 'blink', 'ants', 'font', 'size', 'yoff', 'threshold', 'bold', 'spacing', 'brightness'];
const renderFields = new Set(['text', 'font', 'size', 'yoff', 'threshold', 'bold', 'spacing']);
const textFields = new Set(['text', 'font']);

function buildSwatches() {
  const box = $('colors');
  for (const [key, { label, rgb }] of Object.entries(COLORS)) {
    const l = document.createElement('label');
    l.title = label;
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'color'; input.value = key;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => { state.color = key; changed(); });
    const sw = document.createElement('span');
    sw.style.background = `rgb(${rgb.join(',')})`;
    l.append(input, sw);
    box.appendChild(l);
  }
}

function loadForm() {
  fields.forEach((f) => {
    const el = $(f);
    if (el.type === 'checkbox') el.checked = !!state[f]; else el.value = state[f];
  });
  $('speedv').textContent = state.speed;
  const radio = document.querySelector(`input[name="color"][value="${state.color}"]`);
  if (radio) radio.checked = true;
}

fields.forEach((f) => {
  const el = $(f);
  el.addEventListener('input', () => {
    state[f] = el.type === 'checkbox' ? el.checked : textFields.has(f) ? el.value : Number(el.value);
    if (f === 'speed') $('speedv').textContent = state.speed;
    if (renderFields.has(f)) state.bitmap = renderText(state);
    changed();
  });
});

function changed() { drawDots(); restartPreview(); save(); }

function editBitmap(fn) { fn(state.bitmap); changed(); }
$('addcols').onclick = () => editBitmap((bm) => {
  const w = bm.width + 8, px = new Array(w * ROWS).fill(0);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < bm.width; x++) px[y * w + x] = bm.px[y * bm.width + x];
  bm.width = w; bm.px = px;
});
$('delcols').onclick = () => editBitmap((bm) => {
  if (bm.width <= 8) return;
  const w = bm.width - 8, px = new Array(w * ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < w; x++) px[y * w + x] = bm.px[y * bm.width + x];
  bm.width = w; bm.px = px;
});
$('clear').onclick = () => editBitmap((bm) => bm.px.fill(0));
$('invert').onclick = () => editBitmap((bm) => { bm.px = bm.px.map((v) => (v ? 0 : 1)); });
$('regen').onclick = () => { state.bitmap = renderText(state); changed(); };

// ---------- dot editor ----------
const DOT = 14;
const dots = $('dots');
function drawDots() {
  const { width, px } = state.bitmap;
  dots.width = width * DOT; dots.height = ROWS * DOT;
  const ctx = dots.getContext('2d');
  const [, off, on] = palette(state.color, 100);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, dots.width, dots.height);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < width; x++) {
    ctx.fillStyle = `rgb(${(px[y * width + x] ? on : off.map((v) => v + 24)).join(',')})`;
    ctx.fillRect(x * DOT + 1, y * DOT + 1, DOT - 2, DOT - 2);
  }
  ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 2;
  // アニメーションは 48 列ごとのコマで切り替わるため、区切りの位置もそれに合わせる。
  const pageW = Number(state.mode) === 5 ? ANIMATION_FRAME_WIDTH : BADGE_W;
  for (let x = pageW; x < width; x += pageW) { ctx.beginPath(); ctx.moveTo(x * DOT, 0); ctx.lineTo(x * DOT, dots.height); ctx.stroke(); }
}
let paint = null;
function dotAt(e) {
  const r = dots.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / DOT), Math.floor((e.clientY - r.top) / DOT)];
}
function setDot(e) {
  const bm = state.bitmap;
  const [x, y] = dotAt(e);
  if (x < 0 || y < 0 || x >= bm.width || y >= ROWS) return;
  const i = y * bm.width + x;
  if (paint === null) paint = bm.px[i] ? 0 : 1;
  if (bm.px[i] !== paint) { bm.px[i] = paint; drawDots(); }
}
dots.addEventListener('pointerdown', (e) => { paint = null; dots.setPointerCapture(e.pointerId); setDot(e); });
dots.addEventListener('pointermove', (e) => { if (e.buttons) setDot(e); });
dots.addEventListener('pointerup', () => { paint = null; restartPreview(); save(); });

// ---------- preview ----------
// raster.js で描く（後で加える GIF の保存でも同じ関数を使い、画面と GIF の見た目を一致させるため）。
const pv = $('preview');
const pvLayout = layout({ dot: 16 });
pv.width = pvLayout.width; pv.height = pvLayout.height;
const pvCtx = pv.getContext('2d');
const pvImage = pvCtx.createImageData(pv.width, pv.height);
// 点滅と枠アニメが 1 段進む間隔（ミリ秒）。led-name-badge と同じ
const EFFECT_TICK = 100;
let timer = null;

function drawFrame(grid) {
  const pal = palette(state.color, state.brightness);
  const idx = rasterize(grid, pvLayout), d = pvImage.data;
  for (let i = 0; i < idx.length; i++) {
    const c = pal[idx[i]];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  pvCtx.putImageData(pvImage, 0, 0);
}
function restartPreview() {
  clearInterval(timer);
  const m = state;
  $('previewNote').hidden = !APPROXIMATE_MODES.has(Number(m.mode));
  // 点滅と枠アニメはモードの速さに連動させず、EFFECT_TICK ごとに進める（led-name-badge と同じ）。
  const interval = frameInterval(m.mode, m.speed), start = performance.now();
  let last = '';
  const step = () => {
    const elapsed = performance.now() - start;
    const frame = Math.floor(elapsed / interval), tick = Math.floor(elapsed / EFFECT_TICK);
    // 画面が変わらないときは描き直さない（rasterize は 1 コマで数万ピクセルを塗るため）
    const key = `${frame}:${tick}`;
    if (key === last) return;
    last = key;
    drawFrame(applyBlinkAndAnts(renderFrame(m.bitmap, m.mode, frame), m, tick));
  };
  step();
  timer = setInterval(step, Math.min(interval, EFFECT_TICK));
}

// テーマはバナーの設定とは別に保存する（state の検証に含めず、壊れても初期値に戻すだけで済むように）。
const THEME_KEY = 'ledbanner.theme';
const themeSelect = $('theme');
themeSelect.value = document.documentElement.dataset.theme; // index.html の先頭で dark / light / auto のどれかに決めてある
themeSelect.addEventListener('input', () => {
  document.documentElement.dataset.theme = themeSelect.value;
  try { localStorage.setItem(THEME_KEY, themeSelect.value); } catch {}
});

buildSwatches();
loadForm();
changed();
