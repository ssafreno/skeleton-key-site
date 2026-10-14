// GPU-animated point particles. Each returns a THREE.Points with userData.update(dt, t) (auto-registered by Room
// when inside room.group at the end of build(); otherwise call room.animate(points)). Points never block raycasts.
import * as THREE from 'three';

const vert = /* glsl */`
  uniform float uTime; uniform float uSize; uniform float uPixelRatio;
  uniform vec3 uBox; uniform int uMode; uniform float uSpeed; uniform float uRise;
  attribute float aSeed;
  varying float vAlpha; varying float vSeed;
  float hash(float n){ return fract(sin(n)*43758.5453123); }
  void main(){
    vec3 p = position;
    float t = uTime * uSpeed;
    float s = aSeed;
    float alpha = 1.0;
    if (uMode == 0) {            // DUST: slow drifting wander inside box
      p.x += sin(t*0.13 + s*6.28) * 0.25 + sin(t*0.37 + s*17.0) * 0.06;
      p.y += sin(t*0.11 + s*3.1) * 0.2 + mod(t*0.02 + s, 1.0) * 0.1;
      p.z += cos(t*0.17 + s*9.0) * 0.25;
      alpha = 0.35 + 0.65 * (0.5 + 0.5*sin(t*0.9 + s*40.0));
    } else if (uMode == 1) {     // EMBERS: rise from origin, fade, respawn
      float life = mod(t*0.35 + s, 1.0);
      p.y += life * uRise;
      p.x += sin(life*9.0 + s*20.0) * 0.08 * life;
      p.z += cos(life*7.0 + s*13.0) * 0.08 * life;
      alpha = smoothstep(0.0, 0.1, life) * (1.0 - life);
    } else if (uMode == 2) {     // BUBBLES: rise in a column, wobble, pop at top
      float life = mod(t*0.5 + s, 1.0);
      p.y += life * uRise;
      p.x += sin(life*12.0 + s*30.0) * 0.015;
      p.z += cos(life*10.0 + s*21.0) * 0.015;
      alpha = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.85, 1.0, life));
    } else {                     // SPARKLES: twinkle in place
      float tw = sin(t*3.0 + s*50.0);
      alpha = pow(max(0.0, tw), 6.0);
      p.y += sin(t*0.5 + s*10.0) * 0.03;
    }
    vAlpha = alpha; vSeed = s;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float sz = uSize * (0.6 + 0.8 * hash(s*91.0));
    gl_PointSize = sz * uPixelRatio * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */`
  uniform vec3 uColor; uniform vec3 uColor2; uniform float uOpacity; uniform int uMode;
  varying float vAlpha; varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a;
    if (uMode == 2) { a = smoothstep(0.5, 0.38, d) * (0.35 + smoothstep(0.25, 0.45, d)); } // bubble ring
    else if (uMode == 3) { float cross = max(1.0 - abs(c.x)*14.0, 0.0) + max(1.0 - abs(c.y)*14.0, 0.0); a = smoothstep(0.5, 0.0, d) * 0.6 + cross * smoothstep(0.5, 0.1, d); }
    else { a = smoothstep(0.5, 0.0, d); a *= a; }
    vec3 col = mix(uColor, uColor2, fract(vSeed * 7.13));
    gl_FragColor = vec4(col * a * vAlpha * uOpacity, 1.0);
  }`;

const MODES = { dust: 0, embers: 1, bubbles: 2, sparkles: 3 };

function makePoints(mode, { count, box, center = [0, 0, 0], color, color2, size, opacity, speed = 1, rise = 1, spawn }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = spawn(i);
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSize: { value: size }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uBox: { value: new THREE.Vector3(...(box || [1, 1, 1])) }, uMode: { value: MODES[mode] }, uSpeed: { value: speed }, uRise: { value: rise },
      uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color(color2 || color) }, uOpacity: { value: opacity },
    },
    vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.position.set(...center);
  pts.frustumCulled = false;
  pts.raycast = () => {};
  pts.userData.noRaycast = true;
  pts.userData.update = (dt, t) => { mat.uniforms.uTime.value = t; };
  pts.userData.setOpacity = (o) => { mat.uniforms.uOpacity.value = o; };
  pts.renderOrder = 6;
  return pts;
}

/** Floating dust motes inside a box [w,h,d] centred at `center`. Lovely inside a moonlight shaft. */
export function dustMotes({ box = [3, 2.5, 3], center = [0, 1.25, 0], count = 220, color = '#ffe8c0', size = 0.018, opacity = 0.5 } = {}) {
  return makePoints('dust', { count, box, center, color, size, opacity, spawn: () => [(Math.random() - 0.5) * box[0], (Math.random() - 0.5) * box[1], (Math.random() - 0.5) * box[2]] });
}

/** Embers rising from a fire. origin = base centre; spread = radius; rise = height (m). */
export function embers({ origin = [0, 0, 0], spread = 0.3, rise = 1.2, count = 60, color = '#ff8a3a', color2 = '#ffd27a', size = 0.03, opacity = 1 } = {}) {
  return makePoints('embers', { count, center: origin, color, color2, size, opacity, rise, speed: 1, spawn: () => [(Math.random() - 0.5) * spread * 2, Math.random() * 0.05, (Math.random() - 0.5) * spread * 2] });
}

/** Bubbles rising in a liquid (cauldron, flask). origin = surface-ish base; radius of the column. */
export function bubbles({ origin = [0, 0, 0], radius = 0.3, rise = 0.25, count = 50, color = '#d8fff4', size = 0.03, opacity = 0.7 } = {}) {
  return makePoints('bubbles', { count, center: origin, color, size, opacity, rise, spawn: () => { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius; return [Math.cos(a) * r, 0, Math.sin(a) * r]; } });
}

/** Twinkling sparkles in a box (magic items, solved puzzles). */
export function sparkles({ box = [0.6, 0.6, 0.6], center = [0, 0, 0], count = 40, color = '#fff2c0', color2 = '#c9a0ff', size = 0.05, opacity = 1 } = {}) {
  return makePoints('sparkles', { count, box, center, color, color2, size, opacity, spawn: () => [(Math.random() - 0.5) * box[0], (Math.random() - 0.5) * box[1], (Math.random() - 0.5) * box[2]] });
}

/**
 * One-shot sparkle burst that animates itself and removes itself. Use for "solved!" moments.
 *   burst(ctx, room.group, [x,y,z], { color, count, radius, duration })
 */
export function burst(ctx, parent, position, { color = '#ffe2a0', color2 = '#ffffff', count = 80, radius = 0.6, duration = 1.4, size = 0.025 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), vel = [];
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.4 + Math.random() * 0.8));
    v.y = Math.abs(v.y) * 0.8 + radius * 0.2;
    vel.push(v);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, map: dotTexture() });
  const pts = new THREE.Points(geo, mat);
  pts.position.set(...position);
  pts.raycast = () => {};
  pts.userData.noRaycast = true;
  pts.frustumCulled = false;
  parent.add(pts);
  const c1 = new THREE.Color(color), c2 = new THREE.Color(color2);
  return ctx.tween.run(duration, (k) => {
    const e = 1 - Math.pow(1 - k, 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = vel[i].x * e; pos[i * 3 + 1] = vel[i].y * e - 0.25 * k * k; pos[i * 3 + 2] = vel[i].z * e;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 1 - k * k;
    mat.color.copy(c1).lerp(c2, k);
  }).then(() => { parent.remove(pts); geo.dispose(); mat.dispose(); });
}

let _dot = null;
function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
