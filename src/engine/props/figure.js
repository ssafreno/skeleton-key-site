// Low-poly human presences: Mrs. Tallow (standing, a ring of keys), Mr. Finch (seated, a blanket, a badge),
// Miss Pell (standing or seated at a card table: an apron, a duster) and Mr. Wick (at a bench or standing: sleeve
// garters, a loupe, hands that never stop).
// Built from lathes and capsules so they read as people at room distance without competing with the props.
// Each figure group carries userData.update(dt, t) (breathing, idle head turns) and helpers: walkTo, face, lookAt.
// All figures face +Z in their own frame; seated figures put their origin at the seat's front edge on the floor.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function lathe(points, mat, segs = 24, phiStart = 0, phiLength = TAU) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.castShadow = true; return m;
}
function sphere(r, mat, ws = 18, hs = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat); m.castShadow = true; return m;
}
function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m;
}

const mats = (() => {
  const cache = {};
  return (name, color, extra = {}) => cache[name] || (cache[name] = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra }));
})();

/** A shoulder/elbow/hand chain. Returns { sh, el, hand } so poses and fidgets can drive it. */
function arm(parent, s, { shPos, uaLen = 0.22, faLen = 0.2, r = 0.04, mat, skin, handR = 0.035 }) {
  const sh = new THREE.Group(); sh.position.set(shPos[0] * s, shPos[1], shPos[2]); parent.add(sh);
  const ua = capsule(r, uaLen, mat); ua.position.y = -(uaLen / 2 + 0.03); sh.add(ua);
  const el = new THREE.Group(); el.position.y = -(uaLen + 0.05); sh.add(el);
  const fa = capsule(r * 0.9, faLen, mat); fa.position.y = -(faLen / 2 + 0.01); el.add(fa);
  const hand = new THREE.Group(); hand.position.y = -(faLen + 0.03); el.add(hand);
  const palm = sphere(handR, skin, 12, 10); hand.add(palm);
  return { sh, el, hand, ua, palm };
}

/** Four small fingers on a hand group, curling about X. Returns the finger pivots. */
function fingers(hand, skin, r = 0.008, len = 0.028) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Group(); p.position.set((i - 1.5) * 0.017, -0.018, 0.012); hand.add(p);
    const f = capsule(r, len, skin); f.position.y = -(len / 2 + 0.004); p.add(f);
    out.push(p);
  }
  return out;
}

/**
 * @param {{ kind: 'tallow'|'finch'|'pell'|'wick', pose?: string }} o
 *   tallow: standing.  finch: 'seated' (default) | 'standing'.  pell: 'standing' (default) | 'seated'.
 *   wick: 'bench' (default; seated at a workbench, forearms on the bench) | 'standing'.
 *   Seated poses put the origin at the seat's front edge on the floor; the chair/stool belongs to the room.
 *   wick/bench: seat at y 0.5; the hands rest at about y 0.74, z 0.3 from the origin, so a bench top at y 0.72 and
 *   z >= 0.2 fits. Place him facing the bench (his back to the viewer); lookAt twists the torso and turns the head.
 * @returns THREE.Group with userData.update and helper methods
 */
export function makeFigure({ kind = 'tallow', pose } = {}) {
  pose = pose || { finch: 'seated', wick: 'bench' }[kind] || 'standing';
  const g = new THREE.Group();
  g.name = `figure:${kind}`;
  const skinColor = { tallow: '#d9c6b2', finch: '#c9ad8e', pell: '#dccabb', wick: '#cfb79c' }[kind];
  const skin = mats(`skin:${kind}`, skinColor);
  const cloth = mats(`cloth:${kind}`, { tallow: '#2a2731', finch: '#5a4a36', pell: '#3b3f47', wick: '#c9c1b1' }[kind], { roughness: 0.95 });
  const trim = mats(`trim:${kind}`, { tallow: '#d9d2c4', finch: '#8a2e2a', pell: '#ded6c6', wick: '#463c30' }[kind]);
  const hair = mats(`hair:${kind}`, { tallow: '#9b9a9c', finch: '#5a5a5a', pell: '#7a6353', wick: '#cfc9bf' }[kind]);
  const brass = mats('brass', '#c9a24a', { roughness: 0.35, metalness: 0.9 });

  const body = new THREE.Group(); g.add(body);
  let headPivot, upper;
  // per-kind idle behaviour; filled in below
  const idle = { yawAmp: 0.7, pitchAmp: 0.15, pitchBase: 0, twist: false };
  const fidget = { hands: [], pick: null };

  if (kind === 'tallow') {
    // a tall, narrow column: skirt to the floor, a high collar, hands folded, a ring of keys at the waist
    const skirt = lathe([[0.26, 0.0], [0.25, 0.02], [0.19, 0.5], [0.165, 0.95], [0.17, 1.02]], cloth, 28);
    body.add(skirt);
    upper = new THREE.Group(); upper.position.y = 1.02; body.add(upper);
    const torso = lathe([[0.17, 0], [0.175, 0.12], [0.165, 0.3], [0.14, 0.42], [0.09, 0.5], [0.06, 0.54], [0, 0.56]], cloth, 24);
    upper.add(torso);
    const collar = lathe([[0.075, 0.5], [0.085, 0.56], [0.075, 0.62], [0.06, 0.63]], trim, 16); upper.add(collar);
    headPivot = new THREE.Group(); headPivot.position.set(0, 0.6, 0); headPivot.rotation.order = 'YXZ'; upper.add(headPivot);
    const head = sphere(0.1, skin); head.scale.set(0.9, 1.12, 0.95); head.position.y = 0.1; headPivot.add(head);
    const bun = sphere(0.062, hair); bun.position.set(0, 0.2, -0.06); headPivot.add(bun);
    const cap = sphere(0.1, hair); cap.scale.set(0.92, 0.7, 0.98); cap.position.set(0, 0.155, -0.012); headPivot.add(cap);
    // arms folded in front
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(0.15 * s, 0.4, 0.02); upper.add(sh);
      const ua = capsule(0.04, 0.22, cloth); ua.position.y = -0.14; sh.add(ua);
      const el = new THREE.Group(); el.position.y = -0.27; sh.add(el);
      const fa = capsule(0.036, 0.2, cloth); fa.position.y = -0.11; fa.rotation.x = 0; el.add(fa);
      const hand = sphere(0.035, skin, 12, 10); hand.position.y = -0.23; el.add(hand);
      sh.rotation.z = 0.18 * s; sh.rotation.x = 0.25; el.rotation.x = -1.65; el.rotation.y = 0.5 * s;
    }
    // the ring of keys
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 18), brass); ring.position.set(0.17, 0.95, 0.03); ring.rotation.y = Math.PI / 2; body.add(ring);
    for (let i = 0; i < 5; i++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.012), brass);
      k.position.set(0.17, 0.9 - i * 0.004, 0.03 + (i - 2) * 0.012); k.rotation.z = (i - 2) * 0.12; body.add(k);
    }
    g.userData.height = 1.78;
  } else if (kind === 'pell') {
    // Miss Pell: small and neat. A dark work coat with its pockets stitched shut, a pale house apron over it,
    // hair set in 1958, a feather duster in her right hand. Standing by default; or seated at a card table.
    const apron = mats('apron', '#d8cfbd', { roughness: 0.9, side: THREE.DoubleSide });
    const stocking = mats('stocking', '#2b2730');
    const shoe = mats('shoe', '#1c1a1c', { roughness: 0.6 });
    const thread = mats('thread', '#b9b0a0');
    const seated = pose === 'seated';
    const seatY = 0.46;
    const waistY = seated ? seatY + 0.02 : 0.95;
    if (!seated) {
      for (const s of [1, -1]) {
        const leg = capsule(0.042, 0.3, stocking); leg.position.set(0.065 * s, 0.26, 0); body.add(leg);
        const sh = box(0.075, 0.04, 0.16, shoe); sh.position.set(0.065 * s, 0.02, 0.03); body.add(sh);
      }
      // the coat skirt from the knee to the waist, the apron skirt over its front half
      body.add(lathe([[0.2, 0.42], [0.2, 0.46], [0.16, 0.75], [0.142, 0.93], [0.15, 0.96]], cloth, 24));
      body.add(lathe([[0.215, 0.5], [0.21, 0.53], [0.17, 0.76], [0.152, 0.93], [0.16, 0.96]], apron, 20, -0.55 * Math.PI, 1.1 * Math.PI));
      // the pockets, each with a stitched line across its mouth, on the coat's flanks behind the apron's edge
      for (const s of [1, -1]) {
        const phi = s * 2.1;
        const pk = box(0.1, 0.11, 0.012, mats('coatpocket', '#434852', { roughness: 0.95 }));
        pk.position.set(0.17 * Math.sin(phi), 0.84, 0.17 * Math.cos(phi)); pk.rotation.y = phi; body.add(pk);
        const st = box(0.1, 0.006, 0.014, thread); st.position.set(0.172 * Math.sin(phi), 0.895, 0.172 * Math.cos(phi)); st.rotation.y = phi; body.add(st);
      }
      // apron strings tied in a bow at the small of the back
      for (const s of [1, -1]) { const b = box(0.07, 0.03, 0.015, apron); b.position.set(0.04 * s, 0.94, -0.15); b.rotation.z = 0.6 * s; body.add(b); }
    } else {
      // seated: knees forward under the coat and apron, shins to the floor
      const lap = lathe([[0.2, seatY - 0.02], [0.21, seatY + 0.05], [0.1, seatY + 0.1], [0, seatY + 0.11]], cloth, 20); lap.scale.set(1, 1, 0.8); lap.position.z = 0.12; body.add(lap);
      const lapCloth = box(0.3, 0.012, 0.26, apron); lapCloth.position.set(0, seatY + 0.118, 0.13); body.add(lapCloth);
      const hem = box(0.38, 0.22, 0.05, cloth); hem.position.set(0, seatY - 0.08, 0.3); body.add(hem);
      const apronHem = box(0.3, 0.2, 0.012, apron); apronHem.position.set(0, seatY - 0.06, 0.33); body.add(apronHem);
      for (const s of [1, -1]) {
        const shin = capsule(0.042, 0.26, stocking); shin.position.set(0.07 * s, 0.2, 0.3); body.add(shin);
        const sh = box(0.075, 0.04, 0.16, shoe); sh.position.set(0.07 * s, 0.02, 0.34); body.add(sh);
      }
    }
    upper = new THREE.Group(); upper.position.set(0, waistY, seated ? -0.08 : 0); body.add(upper);
    upper.add(lathe([[0.15, 0], [0.155, 0.1], [0.145, 0.28], [0.12, 0.38], [0.075, 0.45], [0.055, 0.48], [0, 0.5]], cloth, 22));
    // the apron bib, a little proud of the coat
    upper.add(lathe([[0.16, 0.0], [0.162, 0.08], [0.15, 0.24], [0.11, 0.34], [0.09, 0.39]], apron, 16, -0.42 * Math.PI, 0.84 * Math.PI));
    const collar = lathe([[0.065, 0.44], [0.08, 0.49], [0.07, 0.54], [0.055, 0.55]], trim, 16); upper.add(collar);
    headPivot = new THREE.Group(); headPivot.position.set(0, 0.5, 0); headPivot.rotation.order = 'YXZ'; upper.add(headPivot);
    const head = sphere(0.1, skin); head.scale.set(0.88, 1.06, 0.92); head.position.y = 0.1; headPivot.add(head);
    // the set: a close cap with rolled sides and a roll at the nape
    const cap = sphere(0.105, hair); cap.scale.set(1.06, 0.7, 1.08); cap.position.set(0, 0.165, -0.015); headPivot.add(cap);
    for (const s of [1, -1]) { const roll = sphere(0.046, hair, 12, 10); roll.scale.set(1, 0.95, 1.15); roll.position.set(0.083 * s, 0.11, -0.025); headPivot.add(roll); }
    const nape = sphere(0.05, hair, 12, 10); nape.scale.set(1.5, 0.75, 0.8); nape.position.set(0, 0.085, -0.085); headPivot.add(nape);
    // arms: the left hand rests at the apron front; the right hangs with the duster
    const L = arm(upper, 1, { shPos: [0.13, 0.4, 0.01], uaLen: 0.2, faLen: 0.18, r: 0.036, mat: cloth, skin, handR: 0.032 });
    L.sh.rotation.z = 0.12; L.sh.rotation.x = seated ? -0.1 : 0.3; L.el.rotation.x = seated ? -1.25 : -1.55; L.el.rotation.y = seated ? 0.4 : 0.55;
    const R = arm(upper, -1, { shPos: [0.13, 0.4, 0.01], uaLen: 0.2, faLen: 0.18, r: 0.036, mat: cloth, skin, handR: 0.032 });
    R.sh.rotation.z = -0.14; R.sh.rotation.x = seated ? -0.1 : 0.12; R.el.rotation.x = seated ? -1.15 : -0.3; R.el.rotation.y = seated ? -0.35 : 0;
    const duster = new THREE.Group(); duster.rotation.x = seated ? 1.2 : 0.55; duster.rotation.z = -0.15; R.hand.add(duster);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.18, 8), mats('dusterwood', '#5a3d24', { roughness: 0.7 })); handle.position.y = -0.05; handle.castShadow = true; duster.add(handle);
    const feather = mats('feather', '#c6a252', { roughness: 1 });
    const plume = sphere(0.05, feather, 12, 10); plume.scale.set(0.8, 1.7, 0.8); plume.position.y = -0.21; duster.add(plume);
    for (let i = 0; i < 3; i++) { const tuft = sphere(0.03, feather, 8, 6); tuft.scale.set(0.8, 1.6, 0.8); tuft.position.set(Math.sin(i * 2.1) * 0.03, -0.25 - i * 0.01, Math.cos(i * 2.1) * 0.03); duster.add(tuft); }
    g.userData.duster = duster;
    idle.yawAmp = 0.5; idle.pitchAmp = 0.12;
    g.userData.height = seated ? 1.2 : 1.62;
  } else if (kind === 'wick') {
    // Mr. Wick: small and neat. Shirt sleeves with garters, a dark waistcoat, a loupe pushed up on a band,
    // spectacles, and a pick that never stops turning in his fingers. At a bench by default; or on his feet.
    const trousers = mats('trousers', '#2e2a2a');
    const shoe = mats('shoe', '#1c1a1c', { roughness: 0.6 });
    const garter = mats('garter', '#8a2e2a', { roughness: 0.6 });
    const dark = mats('loupe', '#2a2622', { roughness: 0.4, metalness: 0.6 });
    const bench = pose === 'bench';
    const seatY = 0.52;
    if (!bench) {
      for (const s of [1, -1]) {
        const leg = capsule(0.058, 0.6, trousers); leg.position.set(0.085 * s, 0.4, 0); body.add(leg);
        const sh = box(0.085, 0.045, 0.19, shoe); sh.position.set(0.085 * s, 0.022, 0.035); body.add(sh);
      }
      body.add(lathe([[0.17, 0.72], [0.185, 0.78], [0.17, 0.9], [0.165, 0.95]], trousers, 20));
    } else {
      // on a stool: thighs forward, shins down, the feet tucked
      for (const s of [1, -1]) {
        const th = capsule(0.06, 0.26, trousers); th.rotation.x = Math.PI / 2; th.position.set(0.085 * s, seatY + 0.05, 0.14); body.add(th);
        const shin = capsule(0.052, 0.34, trousers); shin.position.set(0.085 * s, 0.24, 0.29); body.add(shin);
        const sh = box(0.085, 0.045, 0.19, shoe); sh.position.set(0.085 * s, 0.022, 0.33); body.add(sh);
      }
      const seatCloth = lathe([[0.19, seatY - 0.01], [0.2, seatY + 0.06], [0.1, seatY + 0.1], [0, seatY + 0.11]], trousers, 18); seatCloth.scale.set(1, 1, 0.75); seatCloth.position.z = 0.06; body.add(seatCloth);
    }
    upper = new THREE.Group(); upper.position.set(0, bench ? seatY + 0.02 : 0.93, bench ? -0.08 : 0); body.add(upper);
    if (bench) upper.rotation.x = 0.16;
    // the shirt, then the waistcoat over it with a V of shirt and a tie showing at the front
    upper.add(lathe([[0.15, 0], [0.16, 0.1], [0.15, 0.3], [0.125, 0.4], [0.08, 0.46], [0.058, 0.49], [0, 0.51]], cloth, 22));
    upper.add(lathe([[0.158, 0.0], [0.168, 0.1], [0.158, 0.3], [0.132, 0.4], [0.095, 0.44]], trim, 22));
    for (const s of [1, -1]) { const v = box(0.045, 0.19, 0.01, cloth); v.position.set(0.035 * s, 0.33, 0.158); v.rotation.z = -0.32 * s; v.rotation.x = -0.1; upper.add(v); }
    const tie = box(0.028, 0.2, 0.008, mats('tie', '#4a2c2c', { roughness: 0.6 })); tie.position.set(0, 0.3, 0.166); tie.rotation.x = -0.12; upper.add(tie);
    for (let i = 0; i < 3; i++) { const b = sphere(0.007, brass, 8, 6); b.position.set(0, 0.1 + i * 0.07, 0.166 - i * 0.003); upper.add(b); }
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0025, 4, 12, Math.PI), brass); chain.position.set(-0.05, 0.15, 0.165); chain.rotation.z = Math.PI; upper.add(chain);
    const collar = lathe([[0.062, 0.45], [0.078, 0.49], [0.07, 0.53], [0.055, 0.54]], cloth, 16); upper.add(collar);
    headPivot = new THREE.Group(); headPivot.position.set(0, 0.5, 0.01); headPivot.rotation.order = 'YXZ'; upper.add(headPivot);
    const head = sphere(0.1, skin); head.scale.set(0.9, 1.04, 0.9); head.position.y = 0.1; headPivot.add(head);
    const cap = sphere(0.1, hair); cap.scale.set(0.96, 0.52, 1.0); cap.position.set(0, 0.168, -0.028); headPivot.add(cap);
    const tache = box(0.05, 0.011, 0.014, hair); tache.position.set(0, 0.068, 0.088); headPivot.add(tache);
    // spectacles
    for (const s of [1, -1]) { const lens = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0025, 4, 14), brass); lens.position.set(0.036 * s, 0.1, 0.088); headPivot.add(lens); }
    const bridge = box(0.03, 0.003, 0.003, brass); bridge.position.set(0, 0.104, 0.09); headPivot.add(bridge);
    // the loupe on its band, pushed up to one side of the forehead
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.005, 5, 24), dark); band.rotation.x = Math.PI / 2; band.scale.set(0.95, 1, 1.0); band.position.set(0, 0.148, 0.0); headPivot.add(band);
    const loupe = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.03, 12), dark); loupe.rotation.x = Math.PI / 2 - 0.75; loupe.position.set(0.045, 0.172, 0.082); loupe.castShadow = true; headPivot.add(loupe);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 12), mats('lens', '#aab6b0', { roughness: 0.15, metalness: 0.4 })); glass.position.y = 0.016; loupe.add(glass);
    // arms in shirt sleeves, garters above the elbow; hands with fingers so they can fidget
    for (const s of [1, -1]) {
      const a = arm(upper, s, { shPos: [0.165, 0.42, 0.0], uaLen: 0.21, faLen: 0.2, r: 0.038, mat: cloth, skin, handR: 0.03 });
      a.palm.scale.set(1, 0.75, 1.15);
      const gt = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.006, 5, 16), garter); gt.rotation.x = Math.PI / 2; gt.position.y = -0.1; a.sh.add(gt);
      const f = fingers(a.hand, skin);
      if (bench) { a.sh.rotation.x = -0.55; a.sh.rotation.z = 0.06 * s; a.el.rotation.x = -1.0; a.el.rotation.y = 0.12 * s; a.hand.rotation.x = 0.5; }
      else { a.sh.rotation.x = -0.2; a.sh.rotation.z = 0.1 * s; a.el.rotation.x = -1.15; a.el.rotation.y = 0.45 * s; a.hand.rotation.x = 0.4; }
      fidget.hands.push({ s, ...a, f, base: { elz: a.el.rotation.z, elx: a.el.rotation.x, handx: a.hand.rotation.x } });
      if (s === -1) {
        // a pick turned over between the fingers of the right hand
        const pick = new THREE.Group(); pick.position.set(0, -0.02, 0.012); a.hand.add(pick);
        const shaft = box(0.004, 0.004, 0.11, brass); pick.add(shaft);
        const tip = box(0.004, 0.012, 0.012, brass); tip.position.set(0, 0.006, 0.05); pick.add(tip);
        fidget.pick = pick;
      }
    }
    idle.yawAmp = bench ? 0.35 : 0.6; idle.pitchAmp = 0.1; idle.pitchBase = bench ? 0.32 : 0.04; idle.twist = bench;
    g.userData.height = bench ? 1.25 : 1.62;
  } else if (pose === 'standing') {
    // Finch on his feet: a long coat over trousers, stooped, the blanket left behind
    const trousers = mats('trousers', '#2e2a2a');
    for (const s of [1, -1]) { const leg = capsule(0.07, 0.6, trousers); leg.position.set(0.1 * s, 0.4, 0); body.add(leg); }
    const coat = lathe([[0.2, 0.55], [0.24, 0.6], [0.23, 0.9], [0.21, 1.1], [0.19, 1.25], [0.2, 1.3]], cloth, 24); body.add(coat);
    upper = new THREE.Group(); upper.position.set(0, 1.3, 0.02); upper.rotation.x = 0.12; body.add(upper);
    const torso = lathe([[0.2, 0], [0.21, 0.08], [0.19, 0.22], [0.14, 0.3], [0.08, 0.35], [0, 0.37]], cloth, 22); torso.scale.set(1, 1, 0.85); upper.add(torso);
    const scarf = lathe([[0.09, 0.3], [0.11, 0.36], [0.085, 0.41], [0.06, 0.42]], trim, 16); upper.add(scarf);
    headPivot = new THREE.Group(); headPivot.position.set(0, 0.4, 0.03); headPivot.rotation.order = 'YXZ'; upper.add(headPivot);
    const head = sphere(0.1, skin); head.scale.set(0.95, 1.05, 0.95); head.position.y = 0.1; headPivot.add(head);
    const capm = sphere(0.105, mats('cap', '#3b3a46')); capm.scale.set(1, 0.6, 1); capm.position.set(0, 0.17, -0.01); headPivot.add(capm);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.07), mats('cap', '#3b3a46')); peak.position.set(0, 0.145, 0.1); headPivot.add(peak);
    const beard = sphere(0.07, hair); beard.scale.set(1, 0.8, 0.6); beard.position.set(0, 0.03, 0.07); headPivot.add(beard);
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(0.21 * s, 0.26, 0.0); upper.add(sh);
      const ua = capsule(0.042, 0.24, cloth); ua.position.y = -0.15; sh.add(ua);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      const fa = capsule(0.038, 0.22, cloth); fa.position.y = -0.12; el.add(fa);
      const hand = sphere(0.036, skin, 12, 10); hand.position.y = -0.25; el.add(hand);
      sh.rotation.z = 0.08 * s; el.rotation.x = -0.35;
    }
    g.userData.height = 1.7;
  } else {
    // seated: the chair belongs to the room; this figure's origin is the seat front edge on the floor
    const seatY = 0.44;
    // legs under the blanket: a wedge from the seat to the floor
    const lap = lathe([[0.3, seatY - 0.02], [0.3, seatY + 0.08], [0.1, seatY + 0.12], [0, seatY + 0.13]], cloth, 20); lap.scale.set(1, 1, 0.8); lap.position.z = 0.12; body.add(lap);
    const blanketFront = new THREE.Mesh(new THREE.BoxGeometry(0.62, seatY, 0.05), cloth); blanketFront.position.set(0, seatY / 2, 0.33); blanketFront.castShadow = true; body.add(blanketFront);
    upper = new THREE.Group(); upper.position.set(0, seatY + 0.02, -0.1); body.add(upper);
    const torso = lathe([[0.2, 0], [0.22, 0.14], [0.2, 0.34], [0.15, 0.46], [0.09, 0.52], [0.06, 0.55], [0, 0.57]], cloth, 22); torso.scale.set(1, 1, 0.85); upper.add(torso);
    const scarf = lathe([[0.1, 0.46], [0.12, 0.54], [0.09, 0.6], [0.06, 0.62]], trim, 16); upper.add(scarf);
    headPivot = new THREE.Group(); headPivot.position.set(0, 0.6, 0.02); headPivot.rotation.order = 'YXZ'; upper.add(headPivot);
    const head = sphere(0.1, skin); head.scale.set(0.95, 1.05, 0.95); head.position.y = 0.1; headPivot.add(head);
    const capm = sphere(0.105, mats('cap', '#3b3a46')); capm.scale.set(1, 0.6, 1); capm.position.set(0, 0.17, -0.01); headPivot.add(capm);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.07), mats('cap', '#3b3a46')); peak.position.set(0, 0.145, 0.1); headPivot.add(peak);
    const beard = sphere(0.07, hair); beard.scale.set(1, 0.8, 0.6); beard.position.set(0, 0.03, 0.07); headPivot.add(beard);
    // arms resting on the lap
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(0.19 * s, 0.42, 0.0); upper.add(sh);
      const ua = capsule(0.042, 0.2, cloth); ua.position.y = -0.13; sh.add(ua);
      const el = new THREE.Group(); el.position.y = -0.25; sh.add(el);
      const fa = capsule(0.038, 0.2, cloth); fa.position.y = -0.11; el.add(fa);
      const hand = sphere(0.036, skin, 12, 10); hand.position.y = -0.23; el.add(hand);
      sh.rotation.z = 0.1 * s; sh.rotation.x = 0.3; el.rotation.x = -1.3; el.rotation.y = 0.25 * s;
    }
    // the badge, pinned to the blanket where a close-up can read it
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 20), brass);
    badge.rotation.x = Math.PI / 2; badge.position.set(-0.04, 0.33, 0.178); upper.add(badge);
    g.userData.badge = badge;
    g.userData.height = 1.3;
  }

  // ---- animation ----
  let idleT = 1.5, idleYaw = 0, idlePitch = idle.pitchBase, yaw = 0, pitch = idle.pitchBase, twist = 0, lookTarget = null, lookUntil = 0;
  const upperYaw0 = upper.rotation.y;
  const tmp = new THREE.Vector3();
  const breathPeriod = { tallow: 5.5, finch: 4, pell: 4.6, wick: 3.6 }[kind];
  g.userData.update = (dt, t) => {
    const breath = Math.sin((t * TAU) / breathPeriod);
    upper.scale.set(1 + 0.006 * breath, 1 + 0.008 * breath, 1 + 0.006 * breath);
    if ((idleT -= dt) <= 0) { idleYaw = (Math.random() - 0.5) * idle.yawAmp; idlePitch = idle.pitchBase + (Math.random() - 0.5) * idle.pitchAmp; idleT = 2.5 + Math.random() * 4; }
    let ty = idleYaw, tp = idlePitch, tw = 0;
    if (lookTarget && t < lookUntil) {
      headPivot.getWorldPosition(tmp);
      const d = lookTarget.clone().sub(tmp);
      const worldYaw = Math.atan2(d.x, d.z);
      let local = worldYaw - g.rotation.y;
      while (local > Math.PI) local -= TAU; while (local < -Math.PI) local += TAU;
      if (idle.twist) {
        // at the bench he turns from the waist as well, enough to look over his shoulder
        const total = clamp(local, -2.0, 2.0);
        tw = clamp(total * 0.45, -0.75, 0.75);
        ty = clamp(total - tw, -1.1, 1.1);
      } else {
        ty = clamp(local, -1.1, 1.1);
      }
      tp = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.4);
    }
    yaw = damp(yaw, ty, 3, dt); pitch = damp(pitch, tp, 3, dt);
    headPivot.rotation.y = yaw; headPivot.rotation.x = pitch;
    if (idle.twist) { twist = damp(twist, tw, 2.2, dt); upper.rotation.y = upperYaw0 + twist; }
    if (fidget.hands.length) {
      // hands that never stop: fingers drum in bursts, a wrist turns, the pick rolls between the fingers
      for (const h of fidget.hands) {
        const burst = clamp(Math.sin(t * 0.43 + h.s * 1.9) * 1.6 + 0.3, 0, 1);
        for (let i = 0; i < h.f.length; i++) h.f[i].rotation.x = 0.45 + 0.55 * burst * Math.max(0, Math.sin(t * 7.2 + i * 0.95 + h.s * 2.3));
        h.el.rotation.z = h.base.elz + 0.05 * h.s * Math.sin(t * 2.7 + h.s);
        h.hand.rotation.x = h.base.handx + 0.08 * Math.sin(t * 1.9 + h.s * 0.7);
      }
      if (fidget.pick) { fidget.pick.rotation.z = t * 1.6 + 0.6 * Math.sin(t * 3.3); fidget.pick.rotation.y = 0.25 * Math.sin(t * 1.1); }
    }
    g.userData._t = t;
  };
  g.userData.lookAt = (worldPoint, seconds = 4) => { lookTarget = worldPoint.clone(); lookUntil = (g.userData._t || 0) + seconds; };
  g.userData.face = (yawAngle) => { g.rotation.y = yawAngle; };

  /** Glide the figure to a parent-local point with a small bob and footsteps. Standing figures only. */
  g.userData.walkTo = async (ctx, to, { speed = 0.9, faceYaw = null } = {}) => {
    const from = g.position.clone();
    const target = new THREE.Vector3(...to);
    const dx = target.x - from.x, dz = target.z - from.z;
    const dist = Math.hypot(dx, dz);
    const turnTo = async (y, dur) => {
      let y0 = g.rotation.y;
      while (y - y0 > Math.PI) y -= TAU; while (y - y0 < -Math.PI) y += TAU;
      await ctx.tween.to(g.rotation, { y }, { duration: dur, ease: 'inOutSine' });
    };
    if (dist > 0.02) {
      await turnTo(Math.atan2(dx, dz), 0.45);
      const dur = dist / speed;
      let lastStep = 0;
      await ctx.tween.run(dur, (k) => {
        g.position.lerpVectors(from, target, k);
        const phase = k * dur * 2.6;
        g.position.y = Math.abs(Math.sin(phase * Math.PI)) * 0.012;
        const step = Math.floor(phase);
        if (step !== lastStep) { lastStep = step; ctx.audio.play('footstep', { gain: 0.35, pitch: 0.9 }); }
      }, { ease: 'inOutSine' });
      g.position.y = 0;
    }
    if (faceYaw != null) await turnTo(faceYaw, 0.5);
  };
  return g;
}
