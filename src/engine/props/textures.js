// Procedural canvas texture generators. All return THREE.CanvasTexture (sRGB unless noted).
// Results are cached by their options, so calling twice with the same options is cheap.
import * as THREE from 'three';

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/** Deterministic PRNG. */
export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Wrap a canvas as a texture with sensible defaults. */
export function canvasTexture(canvas, { srgb = true, repeat, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amt, 0, 1));
  return '#' + c.getHexString();
}

// ---- value noise -------------------------------------------------------------
function valueNoise2D(seed) {
  const r = rng(seed);
  const N = 256, perm = new Uint8Array(N * 2), vals = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const v00 = vals[perm[X + perm[Y]]], v10 = vals[perm[X + 1 + perm[Y]]];
    const v01 = vals[perm[X + perm[Y + 1]]], v11 = vals[perm[X + 1 + perm[Y + 1]]];
    const u = sm(xf), v = sm(yf);
    return (v00 * (1 - u) + v10 * u) * (1 - v) + (v01 * (1 - u) + v11 * u) * v;
  };
}
export function fbm(noise, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

/** Grayscale noise (linear colour space; good for roughness/bump maps). `bias` = mean brightness (roughnessMap multiplies roughness, so use ~0.85 there). */
export function noiseTexture({ size = 256, scale = 8, seed = 7, contrast = 1, octaves = 4, bias = 0.5 } = {}) {
  return cached(`noise:${size}:${scale}:${seed}:${contrast}:${octaves}:${bias}`, () => {
    const c = makeCanvas(size, size), g = c.getContext('2d');
    const img = g.createImageData(size, size), n = valueNoise2D(seed);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = fbm(n, (x / size) * scale, (y / size) * scale, octaves);
      v = THREE.MathUtils.clamp(bias + (v - 0.5) * contrast, 0, 1) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return canvasTexture(c, { srgb: false, repeat: [1, 1] });
  });
}

/**
 * Wood grain. Grain runs along U (horizontal). Options:
 *   tint (base colour), planks (number of plank seams across V, 0 = none), seed, knots (count), w/h.
 */
export function woodTexture({ tint = '#8a5a32', planks = 0, seed = 3, knots = 2, w = 512, h = 512, grain = 1 } = {}) {
  return cached(`wood:${tint}:${planks}:${seed}:${knots}:${w}:${h}:${grain}`, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d'), r = rng(seed);
    const n = valueNoise2D(seed + 11);
    // base with gentle low-frequency variation
    const img = g.createImageData(w, h);
    const base = new THREE.Color(tint), dark = new THREE.Color(shade(tint, -0.12)), light = new THREE.Color(shade(tint, 0.07));
    const tmp = new THREE.Color();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const warp = fbm(n, x / 180, y / 40, 3) * 6;
        const ring = Math.sin((y / h) * 60 * grain + warp * 2.2 + fbm(n, x / 400, y / 90, 2) * 10);
        const fine = fbm(n, x / 6, y / 1.5, 2);
        let k = 0.5 + 0.32 * ring + (fine - 0.5) * 0.45;
        k = THREE.MathUtils.clamp(k, 0, 1);
        tmp.copy(dark).lerp(light, k).lerp(base, 0.35);
        const i = (y * w + x) * 4;
        img.data[i] = tmp.r * 255; img.data[i + 1] = tmp.g * 255; img.data[i + 2] = tmp.b * 255; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // fine dark grain streaks
    g.globalAlpha = 0.18;
    for (let i = 0; i < 140; i++) {
      const y0 = r() * h, len = 80 + r() * 300, x0 = r() * w;
      g.strokeStyle = shade(tint, -0.22 - r() * 0.1);
      g.lineWidth = 0.6 + r() * 1.2;
      g.beginPath();
      for (let x = 0; x <= len; x += 8) g.lineTo(x0 + x, y0 + Math.sin((x0 + x) / 50 + i) * 2.5);
      g.stroke();
    }
    g.globalAlpha = 1;
    // knots
    for (let k = 0; k < knots; k++) {
      const kx = r() * w, ky = r() * h, rx = 8 + r() * 14, ry = rx * 0.45;
      for (let s = 4; s >= 0; s--) {
        g.strokeStyle = shade(tint, -0.08 - s * 0.03);
        g.globalAlpha = 0.35;
        g.lineWidth = 2;
        g.beginPath(); g.ellipse(kx, ky, rx + s * 6, ry + s * 3, 0, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 0.7; g.fillStyle = shade(tint, -0.25);
      g.beginPath(); g.ellipse(kx, ky, rx * 0.6, ry * 0.6, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    // plank seams
    if (planks > 0) {
      for (let p = 0; p <= planks; p++) {
        const y = Math.round((p / planks) * h);
        g.fillStyle = 'rgba(20,10,4,0.55)'; g.fillRect(0, y - 2, w, 3);
        g.fillStyle = 'rgba(255,230,190,0.08)'; g.fillRect(0, y + 1, w, 1);
        // staggered butt joints
        const jx = (r() * 0.6 + 0.2) * w;
        g.fillStyle = 'rgba(20,10,4,0.45)';
        if (p < planks) g.fillRect(jx, y, 2, h / planks);
      }
    }
    return canvasTexture(c, { repeat: [1, 1] });
  });
}

/** Aged parchment with blotches and darkened edges. */
export function parchmentTexture({ w = 512, h = 512, tint = '#e9d7ad', seed = 5, edge = 0.55 } = {}) {
  return cached(`parch:${w}:${h}:${tint}:${seed}:${edge}`, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d'), r = rng(seed), n = valueNoise2D(seed);
    const img = g.createImageData(w, h);
    const base = new THREE.Color(tint), dark = new THREE.Color(shade(tint, -0.2));
    const tmp = new THREE.Color();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fbm(n, x / 70, y / 70, 4);
      const ex = Math.min(x, w - x) / w, ey = Math.min(y, h - y) / h;
      const e = 1 - Math.min(1, Math.min(ex, ey) * 6);
      const k = THREE.MathUtils.clamp((v - 0.35) * 0.9 + e * edge * 0.8, 0, 1);
      tmp.copy(base).lerp(dark, k);
      const i = (y * w + x) * 4;
      img.data[i] = tmp.r * 255; img.data[i + 1] = tmp.g * 255; img.data[i + 2] = tmp.b * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // stains
    for (let i = 0; i < 6; i++) {
      const x = r() * w, y = r() * h, rad = 10 + r() * 40;
      const gr = g.createRadialGradient(x, y, rad * 0.6, x, y, rad);
      gr.addColorStop(0, 'rgba(140,90,40,0)'); gr.addColorStop(0.85, 'rgba(140,90,40,0.12)'); gr.addColorStop(1, 'rgba(140,90,40,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return canvasTexture(c);
  });
}

/** Draw wrapped text into a 2D context. Returns the y after the last line. */
export function wrapText(g, text, x, y, maxW, lineH) {
  const paras = String(text).split('\n');
  for (const para of paras) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lineH; line = w; } else line = test;
    }
    g.fillText(line, x, y); y += lineH;
  }
  return y;
}

/**
 * Chalkboard surface with chalk text.
 * lines: array of strings or { text, erase (0..1 fraction smudged), size, align, x, y, color }.
 */
export function chalkboardTexture({ lines = [], w = 1024, h = 640, seed = 9, font = '"Cormorant Garamond", Georgia, serif', size = 44, title, padding = 60 } = {}) {
  const key = `chalk:${JSON.stringify(lines)}:${w}:${h}:${seed}:${size}:${title}`;
  return cached(key, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d'), r = rng(seed), n = valueNoise2D(seed);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fbm(n, x / 90, y / 90, 3), smear = fbm(n, x / 300 + 10, y / 30, 2);
      const i = (y * w + x) * 4;
      img.data[i] = 30 + v * 16 + smear * 14; img.data[i + 1] = 40 + v * 18 + smear * 14; img.data[i + 2] = 36 + v * 14 + smear * 12; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // old eraser swirls
    g.globalAlpha = 0.06; g.strokeStyle = '#fff'; g.lineWidth = 40; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      g.beginPath(); const x = r() * w, y = r() * h;
      g.moveTo(x, y); g.bezierCurveTo(x + 120, y - 60, x + 200, y + 80, x + 320, y + 10); g.stroke();
    }
    g.globalAlpha = 1;
    let y = padding + size;
    const drawChalk = (text, x, yy, sz, align, color) => {
      g.font = `600 ${sz}px ${font}`;
      g.textAlign = align; g.textBaseline = 'alphabetic';
      // layered jittered passes = chalky
      for (let p = 0; p < 4; p++) {
        g.globalAlpha = 0.28 + r() * 0.15;
        g.fillStyle = color;
        g.fillText(text, x + (r() - 0.5) * 1.6, yy + (r() - 0.5) * 1.6);
      }
      g.globalAlpha = 1;
    };
    if (title) {
      drawChalk(title, w / 2, y, size * 1.25, 'center', '#f4f2e8');
      g.globalAlpha = 0.4; g.fillStyle = '#f4f2e8'; g.fillRect(w * 0.25, y + 12, w * 0.5, 3); g.globalAlpha = 1;
      y += size * 1.9;
    }
    for (const raw of lines) {
      const L = typeof raw === 'string' ? { text: raw } : raw;
      const sz = L.size || size;
      const align = L.align || 'left';
      const x = L.x ?? (align === 'center' ? w / 2 : padding);
      const yy = L.y ?? y;
      drawChalk(L.text, x, yy, sz, align, L.color || '#eef0e6');
      if (L.erase) {
        // smudge part of the line away
        g.font = `600 ${sz}px ${font}`;
        const tw = g.measureText(L.text).width;
        const x0 = align === 'center' ? x - tw / 2 : x;
        const ex = x0 + tw * (1 - L.erase) * r();
        const ew = tw * L.erase;
        const gr = g.createLinearGradient(ex, 0, ex + ew, 0);
        gr.addColorStop(0, 'rgba(38,48,43,0)'); gr.addColorStop(0.2, 'rgba(38,48,43,0.92)'); gr.addColorStop(0.8, 'rgba(38,48,43,0.92)'); gr.addColorStop(1, 'rgba(38,48,43,0)');
        g.fillStyle = gr; g.fillRect(ex, yy - sz, ew, sz * 1.3);
        g.globalAlpha = 0.08; g.fillStyle = '#fff'; g.fillRect(ex, yy - sz * 0.7, ew, sz * 0.8); g.globalAlpha = 1;
      }
      y = yy + sz * 1.45;
    }
    return canvasTexture(c);
  });
}

/**
 * Paper label with centred text (jars, drawers, signs).
 * Options: w,h (px), bg, color, font, border, size (px, auto-fit if omitted), aged.
 */
export function labelTexture(text, { w = 256, h = 128, bg = '#efe2c0', color = '#2b1a10', font = '"Cormorant Garamond", Georgia, serif', weight = 700, size, border = true, aged = true, italic = false } = {}) {
  return cached(`label:${text}:${w}:${h}:${bg}:${color}:${size}:${border}:${aged}:${italic}:${weight}`, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    if (bg) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (aged) {
        const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
        gr.addColorStop(0, 'rgba(255,250,235,0.25)'); gr.addColorStop(1, 'rgba(120,80,30,0.35)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      if (border) {
        g.strokeStyle = color; g.globalAlpha = 0.7; g.lineWidth = Math.max(2, h * 0.025);
        const m = h * 0.08; g.strokeRect(m, m, w - m * 2, h - m * 2);
        g.lineWidth = 1; g.strokeRect(m * 1.6, m * 1.6, w - m * 3.2, h - m * 3.2); g.globalAlpha = 1;
      }
    }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = String(text).split('\n');
    let sz = size || Math.floor(h * 0.62 / lines.length);
    const style = italic ? 'italic ' : '';
    g.font = `${style}${weight} ${sz}px ${font}`;
    const maxW = w * 0.84;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    if (!size && widest > maxW) { sz = Math.floor(sz * maxW / widest); g.font = `${style}${weight} ${sz}px ${font}`; }
    const lh = sz * 1.05;
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh + sz * 0.05));
    return canvasTexture(c);
  });
}

/** Starfield (for sky, dome, telescope). Optional milky band. */
export function starfieldTexture({ w = 2048, h = 1024, count = 2400, seed = 21, band = true, bg = '#05070f' } = {}) {
  return cached(`stars:${w}:${h}:${count}:${seed}:${band}:${bg}`, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d'), r = rng(seed);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, bg); gr.addColorStop(1, shade(bg, 0.04));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (band) {
      for (let i = 0; i < 260; i++) {
        const x = r() * w, y = h * 0.5 + Math.sin((x / w) * Math.PI * 2) * h * 0.12 + (r() - 0.5) * h * 0.15;
        const rad = 20 + r() * 70;
        const b = g.createRadialGradient(x, y, 0, x, y, rad);
        b.addColorStop(0, 'rgba(140,150,210,0.05)'); b.addColorStop(1, 'rgba(140,150,210,0)');
        g.fillStyle = b; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < count; i++) {
      const x = r() * w, y = r() * h, m = Math.pow(r(), 3);
      const rad = 0.4 + m * 1.8;
      const hue = r() < 0.15 ? '255,215,170' : r() < 0.2 ? '180,200,255' : '255,255,255';
      g.fillStyle = `rgba(${hue},${0.35 + m * 0.65})`;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      if (m > 0.6) {
        const s = g.createRadialGradient(x, y, 0, x, y, rad * 5);
        s.addColorStop(0, `rgba(${hue},0.25)`); s.addColorStop(1, `rgba(${hue},0)`);
        g.fillStyle = s; g.fillRect(x - rad * 5, y - rad * 5, rad * 10, rad * 10);
      }
    }
    return canvasTexture(c);
  });
}

/** Stone blocks (walls/floors). */
export function stoneTexture({ tint = '#8a8378', rows = 4, cols = 3, seed = 13, w = 512, h = 512, mortar = '#4a443c' } = {}) {
  return cached(`stone:${tint}:${rows}:${cols}:${seed}:${w}:${h}:${mortar}`, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d'), r = rng(seed), n = valueNoise2D(seed);
    g.fillStyle = mortar; g.fillRect(0, 0, w, h);
    const bh = h / rows;
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) * 0.5;
      for (let col = -1; col <= cols; col++) {
        const bw = w / cols;
        const x = (col + off) * bw, y = row * bh;
        g.fillStyle = shade(tint, (r() - 0.5) * 0.12);
        const m = 4;
        g.beginPath();
        g.roundRect ? g.roundRect(x + m, y + m, bw - m * 2, bh - m * 2, 6) : g.rect(x + m, y + m, bw - m * 2, bh - m * 2);
        g.fill();
      }
    }
    // grime noise overlay
    const img = g.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (fbm(n, x / 40, y / 40, 4) - 0.5) * 50;
      const i = (y * w + x) * 4;
      img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
    }
    g.putImageData(img, 0, 0);
    return canvasTexture(c, { repeat: [1, 1] });
  });
}

/** Soft plaster wall with subtle mottling. */
export function plasterTexture({ tint = '#b9a585', seed = 17, w = 512, h = 512 } = {}) {
  return cached(`plaster:${tint}:${seed}:${w}:${h}`, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d'), n = valueNoise2D(seed);
    const img = g.createImageData(w, h), base = new THREE.Color(tint);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (fbm(n, x / 60, y / 60, 5) - 0.5) * 0.18 + (fbm(n, x / 8, y / 8, 2) - 0.5) * 0.05;
      const i = (y * w + x) * 4;
      img.data[i] = THREE.MathUtils.clamp((base.r + v) * 255, 0, 255);
      img.data[i + 1] = THREE.MathUtils.clamp((base.g + v) * 255, 0, 255);
      img.data[i + 2] = THREE.MathUtils.clamp((base.b + v * 0.9) * 255, 0, 255);
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return canvasTexture(c, { repeat: [1, 1] });
  });
}

/** Fabric weave (velvet/upholstery), tinted. */
export function fabricTexture({ tint = '#7a1c22', seed = 4, size = 256, pattern = 'weave' } = {}) {
  return cached(`fabric:${tint}:${seed}:${size}:${pattern}`, () => {
    const c = makeCanvas(size, size), g = c.getContext('2d'), n = valueNoise2D(seed);
    const img = g.createImageData(size, size), base = new THREE.Color(tint);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const weave = ((x + y) % 4 < 2 ? 0.04 : -0.04) + (fbm(n, x / 30, y / 30, 3) - 0.5) * 0.18;
      const i = (y * size + x) * 4;
      img.data[i] = THREE.MathUtils.clamp((base.r + weave) * 255, 0, 255);
      img.data[i + 1] = THREE.MathUtils.clamp((base.g + weave) * 255, 0, 255);
      img.data[i + 2] = THREE.MathUtils.clamp((base.b + weave) * 255, 0, 255);
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (pattern === 'damask') {
      g.globalAlpha = 0.16; g.fillStyle = shade(tint, 0.15);
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
        const cx = size / 4 + (xx * size) / 2, cy = size / 4 + (yy * size) / 2;
        g.beginPath(); g.ellipse(cx, cy, size * 0.08, size * 0.17, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(cx, cy, size * 0.17, size * 0.06, 0, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    return canvasTexture(c, { repeat: [1, 1] });
  });
}

/** Patterned rug: border bands + central medallion. */
export function rugTexture({ base = '#6e1d1f', accent = '#c9a24a', dark = '#2a1410', w = 512, h = 768, seed = 8 } = {}) {
  return cached(`rug:${base}:${accent}:${dark}:${w}:${h}:${seed}`, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = dark; g.fillRect(0, 0, w, h);
    const band = (m, col) => { g.fillStyle = col; g.fillRect(m, m, w - m * 2, h - m * 2); };
    band(14, accent); band(26, dark); band(46, base);
    g.strokeStyle = accent; g.lineWidth = 3;
    for (let i = 0; i < 40; i++) { const y = 46 + i * ((h - 92) / 40); g.beginPath(); g.moveTo(32, y); g.lineTo(40, y + 6); g.stroke(); g.beginPath(); g.moveTo(w - 32, y); g.lineTo(w - 40, y + 6); g.stroke(); }
    // medallion
    g.save(); g.translate(w / 2, h / 2);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = [accent, dark, '#a8452f', accent][k];
      const s = 1 - k * 0.22;
      g.beginPath(); g.moveTo(0, -h * 0.28 * s); g.lineTo(w * 0.28 * s, 0); g.lineTo(0, h * 0.28 * s); g.lineTo(-w * 0.28 * s, 0); g.closePath(); g.fill();
    }
    g.restore();
    // corner motifs
    g.fillStyle = accent;
    for (const [x, y] of [[90, 90], [w - 90, 90], [90, h - 90], [w - 90, h - 90]]) { g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill(); }
    // wear
    const n = valueNoise2D(seed), img = g.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (fbm(n, x / 50, y / 50, 3) - 0.5) * 40 + ((x + y) % 3 === 0 ? -6 : 0);
      const i = (y * w + x) * 4; img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
    }
    g.putImageData(img, 0, 0);
    return canvasTexture(c);
  });
}

/** Book spine detail (bands + title block), white-based so instanceColor/material colour tints it. */
export function bookSpineTexture() {
  return cached('bookspine', () => {
    const w = 64, h = 256, c = makeCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.25, 'rgba(0,0,0,0)'); gr.addColorStop(0.75, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,214,120,0.95)';
    for (const y of [18, 26, h - 30, h - 22]) g.fillRect(0, y, w, 4);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(10, 70, w - 20, 60);
    g.fillStyle = 'rgba(255,214,120,0.8)';
    for (let i = 0; i < 3; i++) g.fillRect(16, 82 + i * 14, w - 32 - i * 6, 4);
    return canvasTexture(c);
  });
}

/** Clear the generator cache (rarely needed). */
export function clearTextureCache() { cache.clear(); }
