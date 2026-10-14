// Shared palette + material factories. Every factory returns a SHARED cached material for identical
// options (cheap, consistent). Pass { unique: true } to get your own copy you can mutate/animate.
// Hover highlighting never mutates materials (Interaction swaps in a temporary clone), so sharing is safe.
import * as THREE from 'three';
import { woodTexture, stoneTexture, plasterTexture, fabricTexture, parchmentTexture, noiseTexture, chalkboardTexture } from './textures.js';

export const palette = {
  oak: '#9b6a3c',
  oakLight: '#b8854f',
  walnut: '#4b2f1e',
  walnutDark: '#2e1c12',
  mahogany: '#6a2c1c',
  brass: '#c9a24a',
  brassDark: '#8f6c26',
  copper: '#b46a3c',
  iron: '#3a3836',
  ironTarnish: '#4a4640',
  parchment: '#e9d7ad',
  velvet: '#7a1c22',
  velvetGreen: '#1f4a36',
  velvetBlue: '#1f2f5a',
  teal: '#2f8f8a',
  tealDeep: '#16504e',
  stone: '#8a8378',
  stoneDark: '#5a554d',
  plaster: '#b9a585',
  chalk: '#26302b',
  wax: '#efe4c8',
  gold: '#e1b84f',
  ink: '#1b1410',
  moon: '#bcd0ff',
  candle: '#ffb066',
  fire: '#ff8a3a',
};

const cache = new Map();
function make(key, opts, build) {
  if (opts?.unique) return build();
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}
function k(name, o) { return name + ':' + JSON.stringify(o || {}); }
function rep(tex, repeat) {
  if (!repeat) return tex;
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

/**
 * Generic textured wood. opts: { tint, planks, seed, repeat:[u,v], roughness, unique }
 */
export function wood(opts = {}) {
  const { tint = palette.oak, planks = 0, seed = 3, repeat, roughness = 0.62 } = opts;
  return make(k('wood', { tint, planks, seed, repeat, roughness }), opts, () => new THREE.MeshStandardMaterial({
    map: rep(woodTexture({ tint, planks, seed }), repeat),
    roughness,
    roughnessMap: rep(noiseTexture({ scale: 24, seed: 2, contrast: 0.5, bias: 0.9 }), repeat),
    metalness: 0,
  }));
}
export const oak = (o = {}) => wood({ tint: palette.oak, ...o });
export const walnut = (o = {}) => wood({ tint: palette.walnut, seed: 6, roughness: 0.55, ...o });
export const mahogany = (o = {}) => wood({ tint: palette.mahogany, seed: 8, roughness: 0.5, ...o });
/** Floorboards: wood with plank seams. repeat e.g. [2, 3] for a 6 m floor. */
export const floorboards = (o = {}) => wood({ tint: '#7a5232', planks: 6, seed: 12, roughness: 0.7, ...o });

export function brass(opts = {}) {
  const { color = palette.brass, roughness = 0.32, polished = false } = opts;
  return make(k('brass', { color, roughness, polished }), opts, () => new THREE.MeshStandardMaterial({
    color, metalness: 1, roughness: polished ? 0.18 : roughness,
    roughnessMap: noiseTexture({ scale: 10, seed: 31, contrast: 0.6, bias: 0.85 }),
  }));
}
export const gold = (o = {}) => brass({ color: palette.gold, roughness: 0.25, ...o });
export const copper = (o = {}) => brass({ color: palette.copper, roughness: 0.38, ...o });

export function iron(opts = {}) {
  const { color = palette.ironTarnish, roughness = 0.62 } = opts;
  return make(k('iron', { color, roughness }), opts, () => new THREE.MeshStandardMaterial({
    color, metalness: 0.85, roughness,
    roughnessMap: noiseTexture({ scale: 14, seed: 41, contrast: 1.0, bias: 0.85 }),
  }));
}

export function stone(opts = {}) {
  const { tint = palette.stone, rows = 4, cols = 3, repeat, roughness = 0.9, seed = 13 } = opts;
  return make(k('stone', { tint, rows, cols, repeat, roughness, seed }), opts, () => new THREE.MeshStandardMaterial({
    map: rep(stoneTexture({ tint, rows, cols, seed }), repeat), roughness, metalness: 0,
  }));
}
/** Smooth carved stone (pedestals, sills) — no block pattern. */
export function smoothStone(opts = {}) {
  const { color = '#9a9286', roughness = 0.8 } = opts;
  return make(k('smoothStone', { color, roughness }), opts, () => new THREE.MeshStandardMaterial({
    color, roughness, roughnessMap: noiseTexture({ scale: 6, seed: 51, bias: 0.9, contrast: 0.5 }), bumpMap: noiseTexture({ scale: 20, seed: 52 }), bumpScale: 0.6,
  }));
}

export function plaster(opts = {}) {
  const { tint = palette.plaster, repeat, roughness = 0.95 } = opts;
  return make(k('plaster', { tint, repeat, roughness }), opts, () => new THREE.MeshStandardMaterial({
    map: rep(plasterTexture({ tint }), repeat), roughness,
  }));
}

export function velvet(opts = {}) {
  const { color = palette.velvet, pattern = 'weave', repeat } = opts;
  return make(k('velvet', { color, pattern, repeat }), opts, () => new THREE.MeshPhysicalMaterial({
    map: rep(fabricTexture({ tint: color, pattern }), repeat),
    roughness: 0.85, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffd6c0'), 0.5),
  }));
}

export function parchment(opts = {}) {
  const { tint = palette.parchment } = opts;
  return make(k('parchment', { tint }), opts, () => new THREE.MeshStandardMaterial({
    map: parchmentTexture({ tint }), roughness: 0.9, side: THREE.DoubleSide,
  }));
}

/** Transparent glass. color tints it; opacity ~0.25. */
export function glass(opts = {}) {
  const { color = '#cfe8ea', opacity = 0.22, roughness = 0.06 } = opts;
  return make(k('glass', { color, opacity, roughness }), opts, () => new THREE.MeshPhysicalMaterial({
    color, metalness: 0, roughness, transparent: true, opacity, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 1, envMapIntensity: 1.6, side: THREE.DoubleSide,
  }));
}
export const tealGlass = (o = {}) => glass({ color: palette.teal, opacity: 0.45, ...o });

/** Self-lit liquid/contents (potions, vials). glow 0..2. */
export function glowing(opts = {}) {
  const { color = palette.teal, glow = 0.8, roughness = 0.3, opacity = 1 } = opts;
  return make(k('glowing', { color, glow, roughness, opacity }), opts, () => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: glow, roughness, transparent: opacity < 1, opacity,
  }));
}

/** Chalkboard surface with chalk text (see textures.chalkboardTexture for line options). */
export function chalkboard(opts = {}) {
  return make(k('chalkboard', opts), opts, () => new THREE.MeshStandardMaterial({
    map: chalkboardTexture(opts), roughness: 0.95,
  }));
}

export function wax(opts = {}) {
  const { color = palette.wax } = opts;
  return make(k('wax', { color }), opts, () => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.55, transmission: 0, sheen: 0.3, emissive: '#ffb066', emissiveIntensity: 0.06,
  }));
}

/** Flat matte colour (for small bits: string, cloth, paint). */
export function matte(color = '#777', opts = {}) {
  const { roughness = 0.85, metalness = 0 } = opts;
  return make(k('matte', { color, roughness, metalness }), opts, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
}

/** Unlit additive glow (flames, runes, shafts). */
export function additive(color = '#ffb066', opts = {}) {
  const { opacity = 1 } = opts;
  return make(k('additive', { color, opacity }), opts, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
}

/** Glowing rune/sigil material from a canvas texture (alpha from the texture). */
export function emissiveDecal(map, opts = {}) {
  const { color = '#bfe0ff', intensity = 2.5 } = opts;
  return new THREE.MeshBasicMaterial({
    map, color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

export function clearMaterialCache() { cache.clear(); }
