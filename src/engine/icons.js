// Procedural inventory icons. Each drawer paints into a 100×100 unit space (scaled to `size`).
// Flat illustration style: warm fills, a dark brown outline, one highlight.
//   icons[id](ctx2d, size)
// Inventory uses items[id].drawIcon if present, else icons[id], else icons._unknown.

const INK = '#2b1a10';

function begin(ctx, size) {
  ctx.save();
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.4;
}
function end(ctx) { ctx.restore(); }

function shape(ctx, fill, path, { stroke = true, lw } = {}) {
  ctx.beginPath();
  path(ctx);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { if (lw) ctx.lineWidth = lw; ctx.stroke(); ctx.lineWidth = 3.4; }
}
function rrect(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function shadow(ctx, cx = 50, cy = 90, rx = 32, ry = 5) {
  ctx.save();
  ctx.fillStyle = 'rgba(40,20,10,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function shine(ctx, x, y, w, h, a = 0.45) {
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- jar helper -------------------------------------------------------------
function jar(ctx, size, { contents, contentsTop = 42, glow, label, labelColor = '#f1e3bf', lid = '#8a5a2b', deco }) {
  begin(ctx, size);
  shadow(ctx, 50, 92, 26, 4);
  // contents (behind glass)
  ctx.save();
  ctx.beginPath(); rrect(ctx, 27, 30, 46, 58, 9); ctx.clip();
  if (glow) {
    const g = ctx.createRadialGradient(50, 64, 2, 50, 64, 34);
    g.addColorStop(0, glow); g.addColorStop(1, contents);
    ctx.fillStyle = g;
  } else ctx.fillStyle = contents;
  ctx.fillRect(20, contentsTop, 60, 60);
  deco?.(ctx);
  ctx.restore();
  // glass
  shape(ctx, 'rgba(200,235,240,0.22)', (c) => rrect(c, 27, 30, 46, 58, 9));
  // neck + lid
  shape(ctx, 'rgba(200,235,240,0.3)', (c) => rrect(c, 33, 22, 34, 10, 3));
  shape(ctx, lid, (c) => rrect(c, 30, 11, 40, 13, 4));
  ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  for (let x = 36; x < 66; x += 6) { ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, 21); ctx.stroke(); }
  ctx.restore();
  // label
  if (label) {
    shape(ctx, labelColor, (c) => rrect(c, 32, 52, 36, 20, 2), { lw: 2.4 });
    ctx.fillStyle = INK;
    ctx.font = '700 9px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = label.split('\n');
    lines.forEach((ln, i) => ctx.fillText(ln, 50, 62 + (i - (lines.length - 1) / 2) * 8, 32)); // maxWidth keeps long words inside the label
  }
  shine(ctx, 35, 42, 3, 9, 0.5);
  end(ctx);
}

function weight(ctx, size, n, scale) {
  begin(ctx, size);
  shadow(ctx, 50, 90, 30 * scale + 4, 5);
  const w = 52 * scale + 14, h = 34 * scale + 16;
  const x = 50 - w / 2, y = 88 - h;
  // body (trapezoid brass weight)
  shape(ctx, '#c79a3c', (c) => {
    c.moveTo(x + 6, y + 6); c.lineTo(x + w - 6, y + 6); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath();
  });
  // top knob
  shape(ctx, '#d9b25a', (c) => rrect(c, 50 - 9, y - 9, 18, 16, 6));
  shape(ctx, '#e7c878', (c) => rrect(c, x + 3, y + 3, w - 6, 7, 3), { lw: 2.6 });
  // darker side band
  ctx.save(); ctx.fillStyle = 'rgba(80,45,10,0.25)';
  ctx.beginPath(); ctx.moveTo(x + w - 14, y + 10); ctx.lineTo(x + w - 6, y + 10); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - 10, y + h); ctx.fill();
  ctx.restore();
  // stamped number
  // polish: bigger stamped numeral (was 20 + 10 * scale; the 1 and 2 were hard to read in the slot)
  ctx.fillStyle = '#4a2c0a';
  ctx.font = `700 ${Math.round(29 + 16 * scale)}px "Cormorant Garamond", Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 50, y + h / 2 + 4);
  ctx.fillStyle = 'rgba(255,240,200,0.55)';
  ctx.fillText(String(n), 49, y + h / 2 + 3);
  shine(ctx, x + 12, y + 18, 3, 7, 0.4);
  end(ctx);
}

export const icons = {
  parcel(ctx, size) {
    begin(ctx, size);
    shadow(ctx, 50, 88, 36, 5);
    // box body (slightly isometric)
    shape(ctx, '#b88a55', (c) => { c.moveTo(14, 38); c.lineTo(58, 28); c.lineTo(88, 40); c.lineTo(88, 74); c.lineTo(44, 86); c.lineTo(14, 72); c.closePath(); });
    shape(ctx, '#caa06a', (c) => { c.moveTo(14, 38); c.lineTo(58, 28); c.lineTo(88, 40); c.lineTo(44, 52); c.closePath(); });
    shape(ctx, null, (c) => { c.moveTo(44, 52); c.lineTo(44, 86); });
    // string
    ctx.save(); ctx.strokeStyle = '#efe1c0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(29, 34); ctx.lineTo(66, 46); ctx.lineTo(66, 79); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(73, 34); ctx.lineTo(29, 45); ctx.lineTo(29, 79); ctx.stroke();
    ctx.restore();
    // label
    ctx.save(); ctx.translate(58, 64); ctx.rotate(-0.27);
    shape(ctx, '#f3e7c9', (c) => rrect(c, -10, -7, 20, 13, 2), { lw: 2 });
    ctx.strokeStyle = 'rgba(43,26,16,0.6)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-7, -3 + i * 3.5); ctx.lineTo(6 - i * 3, -3 + i * 3.5); ctx.stroke(); }
    ctx.restore();
    // wax seal
    shape(ctx, '#b3262b', (c) => { c.arc(48, 41, 8, 0, Math.PI * 2); });
    shape(ctx, '#d64a45', (c) => { c.arc(48, 41, 4.2, 0, Math.PI * 2); }, { lw: 1.6 });
    end(ctx);
  },

  sardines(ctx, size) {
    begin(ctx, size);
    shadow(ctx, 50, 84, 38, 5);
    // tin body
    shape(ctx, '#9fb2bb', (c) => rrect(c, 12, 46, 76, 30, 13));
    shape(ctx, '#c9d6dc', (c) => rrect(c, 12, 34, 76, 30, 13));
    // printed lid
    shape(ctx, '#2f6d8a', (c) => rrect(c, 20, 39, 60, 20, 9), { lw: 2.4 });
    // fish on lid
    ctx.fillStyle = '#e5eef2';
    ctx.beginPath(); ctx.ellipse(48, 49, 15, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(62, 49); ctx.lineTo(70, 43); ctx.lineTo(70, 55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(38, 48, 1.4, 0, Math.PI * 2); ctx.fill();
    // key on lid
    ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(78, 40); ctx.lineTo(92, 26); ctx.stroke();
    ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.ellipse(94, 22, 5, 7, 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7f0dc'; ctx.beginPath(); ctx.ellipse(94, 22, 2, 3.5, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    shine(ctx, 24, 40, 6, 2, 0.6);
    end(ctx);
  },

  key_brass(ctx, size) {
    begin(ctx, size);
    shadow(ctx, 50, 86, 34, 4);
    ctx.save(); ctx.translate(50, 52); ctx.rotate(-0.6);
    // bow
    shape(ctx, '#d4a843', (c) => { c.arc(-24, 0, 15, 0, Math.PI * 2); });
    shape(ctx, '#f7efd8', (c) => { c.arc(-24, 0, 6.5, 0, Math.PI * 2); }, { lw: 2.6 });
    // decorative trefoil bumps
    shape(ctx, '#d4a843', (c) => { c.arc(-24, -15, 4, Math.PI, 0); });
    // shaft
    shape(ctx, '#d4a843', (c) => rrect(c, -10, -4.5, 46, 9, 3));
    // collar
    shape(ctx, '#b88a2c', (c) => rrect(c, -9, -7, 6, 14, 2), { lw: 2.6 });
    // bit
    shape(ctx, '#d4a843', (c) => { c.moveTo(24, 4); c.lineTo(24, 18); c.lineTo(30, 18); c.lineTo(30, 13); c.lineTo(35, 13); c.lineTo(35, 4); c.closePath(); });
    ctx.restore();
    shine(ctx, 30, 50, 4, 2.5, 0.6);
    end(ctx);
  },

  magnifier(ctx, size) {
    begin(ctx, size);
    shadow(ctx, 52, 88, 32, 4);
    // handle
    ctx.save(); ctx.translate(50, 50); ctx.rotate(0.75);
    shape(ctx, '#5b3520', (c) => rrect(c, 22, -6, 36, 12, 6));
    shape(ctx, '#c9a24a', (c) => rrect(c, 16, -7, 9, 14, 3), { lw: 2.6 });
    ctx.save(); ctx.strokeStyle = 'rgba(255,220,180,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(29, -3); ctx.lineTo(52, -3); ctx.stroke(); ctx.restore();
    ctx.restore();
    // rim + lens
    shape(ctx, '#c9a24a', (c) => { c.arc(40, 40, 27, 0, Math.PI * 2); });
    const g = ctx.createRadialGradient(34, 34, 2, 40, 40, 22);
    g.addColorStop(0, '#eaf6f6'); g.addColorStop(1, '#9cc7cc');
    shape(ctx, g, (c) => { c.arc(40, 40, 20, 0, Math.PI * 2); }, { lw: 2.6 });
    shine(ctx, 31, 31, 4, 8, 0.75);
    shine(ctx, 46, 49, 2, 3, 0.35);
    end(ctx);
  },

  page_incantation(ctx, size) {
    begin(ctx, size);
    shadow(ctx, 50, 90, 32, 4);
    ctx.save(); ctx.translate(50, 50); ctx.rotate(-0.08);
    shape(ctx, '#ecdcb2', (c) => {
      c.moveTo(-27, -38); c.lineTo(24, -38);
      c.quadraticCurveTo(30, -10, 26, 12); c.quadraticCurveTo(30, 30, 27, 40);
      c.lineTo(-25, 40); c.quadraticCurveTo(-30, 0, -27, -38); c.closePath();
    });
    // torn edge accents
    ctx.strokeStyle = 'rgba(120,80,40,0.45)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const y = -26 + i * 8;
      ctx.beginPath(); ctx.moveTo(-17, y); ctx.lineTo(i === 0 ? 4 : 17 - (i % 3) * 5, y); ctx.stroke();
    }
    // illuminated initial
    ctx.fillStyle = '#7a2a8a'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); rrect(ctx, -20, -34, 12, 13, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0d27a'; ctx.font = '700 11px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('R', -14, -27);
    // glowing sigil
    ctx.strokeStyle = '#b07ad0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(2, 26, 7, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5, b = -Math.PI / 2 + ((i + 1) * 4 * Math.PI) / 5;
      ctx.beginPath(); ctx.moveTo(2 + Math.cos(a) * 7, 26 + Math.sin(a) * 7); ctx.lineTo(2 + Math.cos(b) * 7, 26 + Math.sin(b) * 7); ctx.stroke();
    }
    ctx.restore();
    end(ctx);
  },

  jar_fish(ctx, size) {
    jar(ctx, size, {
      contents: '#5f8fb0', glow: '#d6eef8', label: 'FISH\nSCALES', lid: '#7a5232',
      deco: (c) => {
        c.fillStyle = 'rgba(235,250,255,0.7)';
        for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(30 + (i * 37) % 42, 46 + (i * 23) % 40, 2.2, 0, Math.PI); c.fill(); }
      },
    });
  },
  jar_moon(ctx, size) {
    jar(ctx, size, {
      contents: '#9a8fd6', glow: '#f2eeff', label: 'POWDERED\nMOONLIGHT', lid: '#4c4f7a', contentsTop: 46,
      deco: (c) => {
        c.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(31 + (i * 29) % 40, 50 + (i * 17) % 36, 1.1, 0, Math.PI * 2); c.fill(); }
      },
    });
  },
  jar_dawn(ctx, size) {
    jar(ctx, size, {
      contents: '#e0957a', glow: '#ffe2b8', label: 'DAWN\nSALT', lid: '#a0623a', contentsTop: 50,
      deco: (c) => {
        c.fillStyle = 'rgba(255,240,220,0.8)';
        for (let i = 0; i < 18; i++) c.fillRect(29 + (i * 31) % 42, 52 + (i * 13) % 34, 2.2, 2.2);
      },
    });
  },

  elixir(ctx, size) {
    begin(ctx, size);
    shadow(ctx, 50, 91, 24, 4);
    // glow
    const halo = ctx.createRadialGradient(50, 62, 4, 50, 62, 44);
    halo.addColorStop(0, 'rgba(190,110,230,0.45)'); halo.addColorStop(1, 'rgba(190,110,230,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 10, 100, 90);
    // flask body
    const g = ctx.createRadialGradient(44, 64, 3, 50, 66, 26);
    g.addColorStop(0, '#d79bf0'); g.addColorStop(0.5, '#6d2d8f'); g.addColorStop(1, '#3a1452');
    shape(ctx, g, (c) => {
      c.moveTo(43, 30); c.lineTo(43, 44); c.bezierCurveTo(22, 50, 20, 88, 50, 89);
      c.bezierCurveTo(80, 88, 78, 50, 57, 44); c.lineTo(57, 30); c.closePath();
    });
    // liquid surface line
    ctx.save(); ctx.strokeStyle = 'rgba(255,220,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(50, 56, 16, 3, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    // neck glass
    shape(ctx, 'rgba(220,235,240,0.5)', (c) => rrect(c, 42, 24, 16, 10, 2), { lw: 2.6 });
    // cork + wax
    shape(ctx, '#b2875a', (c) => rrect(c, 41, 12, 18, 14, 3));
    shape(ctx, '#7a2a8a', (c) => { c.moveTo(39, 22); c.quadraticCurveTo(50, 30, 61, 22); c.lineTo(61, 26); c.quadraticCurveTo(50, 33, 39, 26); c.closePath(); }, { lw: 2 });
    // sparkles
    ctx.fillStyle = '#fff3c4';
    const star = (x, y, r) => { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.3, y - r * 0.3); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.3, y + r * 0.3); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.3, y + r * 0.3); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.3, y - r * 0.3); ctx.closePath(); ctx.fill(); };
    star(76, 34, 6); star(22, 46, 4); star(70, 80, 3.5);
    shine(ctx, 40, 66, 3, 8, 0.45);
    end(ctx);
  },

  w1(ctx, size) { weight(ctx, size, 1, 0.35); },
  w2(ctx, size) { weight(ctx, size, 2, 0.55); },
  w4(ctx, size) { weight(ctx, size, 4, 0.78); },
  w8(ctx, size) { weight(ctx, size, 8, 1.0); },

  _unknown(ctx, size) {
    begin(ctx, size);
    shadow(ctx, 50, 88, 28, 4);
    // a little cloth pouch
    shape(ctx, '#8a6a9a', (c) => { c.moveTo(34, 34); c.bezierCurveTo(10, 50, 16, 88, 50, 88); c.bezierCurveTo(84, 88, 90, 50, 66, 34); c.closePath(); });
    shape(ctx, '#a785b8', (c) => { c.moveTo(30, 26); c.lineTo(42, 34); c.lineTo(58, 34); c.lineTo(70, 26); c.lineTo(62, 22); c.lineTo(50, 28); c.lineTo(38, 22); c.closePath(); });
    shape(ctx, '#c9a24a', (c) => rrect(c, 38, 31, 24, 6, 3), { lw: 2.4 });
    ctx.fillStyle = '#f3e7c9'; ctx.font = '700 30px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 50, 64);
    end(ctx);
  },
};

/** Draw the icon for `id` into a fresh canvas of `size` px (CSS px × devicePixelRatio handled by caller). */
export function renderIcon(id, size, itemDef) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const fn = itemDef?.drawIcon || icons[id] || icons._unknown;
  try { fn(g, size); } catch (e) { console.error(`[icons] ${id}`, e); icons._unknown(g, size); }
  return c;
}
