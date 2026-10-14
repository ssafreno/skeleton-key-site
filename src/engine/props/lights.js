// Lighting helpers. Keep to ≤2 shadow-casting lights per room (DESIGN §9).
import * as THREE from 'three';

/**
 * Warm point light that flickers like a candle/fire. Animated via userData.update (auto-registered
 * by Room if inside room.group at end of build(), else call room.animate(light)).
 * opts: color, intensity, distance, decay, flicker (0..1 amplitude), speed, castShadow, seed
 * light.userData.setLit(bool, fade?) fades the base intensity (never toggles .visible → no shader recompile).
 */
export function flickerLight({ color = '#ffa252', intensity = 2.2, distance = 6, decay = 2, flicker = 0.18, speed = 1, castShadow = false, seed = Math.random() * 100 } = {}) {
  const light = new THREE.PointLight(color, intensity, distance, decay);
  light.castShadow = castShadow;
  if (castShadow) {
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.002;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 4;
  }
  let base = intensity, target = intensity, s = seed;
  light.userData.baseIntensity = intensity;
  light.userData.setLit = (lit, fade = 0.4) => { target = lit ? light.userData.baseIntensity : 0; light.userData._fade = fade; };
  light.userData.update = (dt, t) => {
    const f = light.userData._fade ?? 0.4;
    base += (target - base) * (f <= 0 ? 1 : Math.min(1, dt / f));
    const tt = t * speed + s;
    const n = Math.sin(tt * 7.3) * 0.5 + Math.sin(tt * 13.7 + 1.3) * 0.3 + Math.sin(tt * 23.1 + 2.1) * 0.2;
    light.intensity = Math.max(0, base * (1 + n * flicker));
  };
  return light;
}

/**
 * Ambient fill rig: hemisphere (sky/ground tint) + low ambient. Returns a Group.
 * opts: sky, ground, hemi (intensity), ambient (colour), ambientIntensity
 */
export function ambientRig({ sky = '#ffd9b0', ground = '#2a1810', hemi = 0.35, ambient = '#40302a', ambientIntensity = 0.25 } = {}) {
  const g = new THREE.Group();
  g.name = 'ambientRig';
  const h = new THREE.HemisphereLight(sky, ground, hemi);
  h.position.set(0, 4, 0);
  g.add(h, new THREE.AmbientLight(ambient, ambientIntensity));
  g.userData.hemi = h;
  return g;
}
export const hemiRig = ambientRig;

/**
 * Shadow-casting spot light (moonlight through a window, a lamp). Returns the SpotLight; add light.target too
 * (it's added as a child for convenience, positioned in world coords via opts.target).
 */
export function keyLight({ color = '#bcd0ff', intensity = 8, position = [2, 3.5, -2], target = [0, 0, 0], angle = 0.5, penumbra = 0.6, distance = 14, decay = 1.6, castShadow = true, mapSize = 1024 } = {}) {
  const l = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
  l.position.set(...position);
  l.target.position.set(...target);
  l.castShadow = castShadow;
  if (castShadow) {
    l.shadow.mapSize.set(mapSize, mapSize);
    l.shadow.bias = -0.0015;
    l.shadow.normalBias = 0.03;
    l.shadow.radius = 5;
    l.shadow.camera.near = 0.3;
    l.shadow.camera.far = distance;
  }
  const g = new THREE.Group();
  g.add(l, l.target);
  g.userData.light = l;
  return g;
}

const shaftVert = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const shaftFrag = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float along = vUv.y;                       // 1 at the source (top), 0 at the far end
    float fall = smoothstep(0.0, 0.35, along) * (0.35 + 0.65 * along);
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); // soft silhouette edges
    float dust = 0.85 + 0.15 * sin(vUv.x * 40.0 + uTime * 0.6 + vUv.y * 12.0);
    gl_FragColor = vec4(uColor * uOpacity * fall * edge * dust, 1.0);
  }`;

/**
 * Translucent additive light shaft (moonlight from a window, light from the dome slit).
 * from/to: world-space points (relative to whatever you add it to). radiusTop at `from`, radiusBottom at `to`.
 * square: true for a box-ish 4-sided shaft (windows), false for a round cone.
 */
export function lightShaft({ from = [0, 3, -2], to = [0, 0, 0], radiusTop = 0.45, radiusBottom = 0.9, color = '#a9c4ff', opacity = 0.16, square = true } = {}) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, len, square ? 4 : 24, 1, true);
  if (square) geo.rotateY(Math.PI / 4);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: shaftVert, fragmentShader: shaftFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
  m.raycast = () => {};
  m.userData.noRaycast = true;
  m.renderOrder = 5;
  m.userData.update = (dt, t) => { mat.uniforms.uTime.value = t; };
  m.userData.setOpacity = (o) => { mat.uniforms.uOpacity.value = o; };
  return m;
}
