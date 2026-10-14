// Canvas-text planes for signs, labels, engraved words, floating glyphs.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, wrapText } from './textures.js';

/**
 * Draw text to a canvas texture. Returns { texture, aspect, canvas }.
 * opts: font (CSS font string, px size used as the base), color, bg (null = transparent), padding (px),
 *       align, lineHeight (×size), maxWidthPx (wrap width), shadow (CSS colour or null), stroke {color,width}
 */
export function makeTextTexture(text, {
  font = '600 64px "Cormorant Garamond", Georgia, serif',
  color = '#2b1a10', bg = null, padding = 24, align = 'center', lineHeight = 1.2, maxWidthPx = 900,
  shadow = null, stroke = null,
} = {}) {
  const size = parseFloat((font.match(/(\d+(?:\.\d+)?)px/) || [0, 64])[1]);
  const meas = makeCanvas(8, 8).getContext('2d');
  meas.font = font;
  // compute wrapped lines
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (meas.measureText(t).width > maxWidthPx && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
  }
  const lh = size * lineHeight;
  const tw = Math.ceil(Math.max(...lines.map((l) => meas.measureText(l).width), 1));
  const w = tw + padding * 2, h = Math.ceil(lh * lines.length + padding * 2);
  const c = makeCanvas(w, h), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.font = font; g.textBaseline = 'middle'; g.textAlign = align;
  const x = align === 'center' ? w / 2 : align === 'right' ? w - padding : padding;
  if (shadow) { g.shadowColor = shadow; g.shadowBlur = size * 0.25; }
  lines.forEach((l, i) => {
    const y = padding + lh * (i + 0.5);
    if (stroke) { g.strokeStyle = stroke.color; g.lineWidth = stroke.width; g.strokeText(l, x, y); }
    g.fillStyle = color; g.fillText(l, x, y);
  });
  const texture = canvasTexture(c);
  return { texture, aspect: w / h, canvas: c };
}

/**
 * A flat mesh showing text. Size is set by `width` (metres); height follows the text's aspect.
 * opts: all of makeTextTexture's, plus width (m, default 0.5), emissive (bool: unlit/glowing),
 *       glow (multiplier when emissive), doubleSide, transparent (default: true when no bg).
 * Returns a THREE.Mesh with userData.setText(newText).
 */
export function makeTextPlane(text, opts = {}) {
  const { width = 0.5, emissive = false, glow = 1, doubleSide = false } = opts;
  const { texture, aspect } = makeTextTexture(text, opts);
  const transparent = opts.transparent ?? !opts.bg;
  const mat = emissive
    ? new THREE.MeshBasicMaterial({ map: texture, transparent, depthWrite: !transparent, color: new THREE.Color(1, 1, 1).multiplyScalar(glow), toneMapped: false, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide })
    : new THREE.MeshStandardMaterial({ map: texture, transparent, depthWrite: !transparent, roughness: 0.85, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide, alphaTest: transparent ? 0.02 : 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), mat);
  mesh.userData.setText = (t) => {
    const r = makeTextTexture(t, opts);
    mat.map.dispose();
    mat.map = r.texture;
    mat.needsUpdate = true;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(width, width / r.aspect);
  };
  return mesh;
}

/**
 * Paint arbitrary canvas content onto a plane: draw(ctx2d, w, h). Returns Mesh.
 * mesh.userData.redraw() repaints with the same draw function; redraw(newDraw) replaces it first (dials, counters).
 */
export function makeCanvasPlane(width, height, draw, { px = 512, emissive = false, transparent = false } = {}) {
  const pw = Math.round(px * Math.max(1, width / height)), ph = Math.round(px * Math.max(1, height / width));
  const c = makeCanvas(pw, ph), g = c.getContext('2d');
  draw(g, pw, ph);
  const tex = canvasTexture(c);
  const mat = emissive ? new THREE.MeshBasicMaterial({ map: tex, transparent, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: tex, transparent, roughness: 0.85 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.userData.canvas = c;
  mesh.userData.redraw = (newDraw) => { if (typeof newDraw === 'function') draw = newDraw; g.clearRect(0, 0, pw, ph); draw(g, pw, ph); tex.needsUpdate = true; };
  return mesh;
}

export { wrapText };
