// Item definitions: name, examine line, and a procedural icon drawn into a 100×100 space.
const INK = '#2b1a10';

function begin(c, size) {
  c.save(); c.scale(size / 100, size / 100);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 3.4;
}
function shadow(c, cx = 50, cy = 90, rx = 30, ry = 5) {
  c.save(); c.fillStyle = 'rgba(40,20,10,0.18)'; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.restore();
}

export const items = {
  pliers: {
    name: 'Pliers',
    plural: true, // "The pliers go…" (House.js `_payLines`)
    examine: 'Needle-nose. The one tool you always have on you.',
    drawIcon(c, size) {
      begin(c, size); shadow(c);
      c.save(); c.translate(50, 50); c.rotate(-0.7);
      const arm = (s) => {
        c.beginPath(); c.moveTo(0, -4 * s); c.lineTo(-6 * s, -40); c.lineTo(-2 * s, -42); c.lineTo(3 * s, -6); c.closePath();
        c.fillStyle = '#9ea3a8'; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(0, 4 * s); c.lineTo(-12 * s, 42); c.lineTo(-4 * s, 44); c.lineTo(4 * s, 8); c.closePath();
        c.fillStyle = '#b8352b'; c.fill(); c.stroke();
      };
      arm(1); arm(-1);
      c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fillStyle = '#5a5f66'; c.fill(); c.stroke();
      c.restore(); c.restore();
    },
  },
  bonekey: {
    name: 'The yellow key',
    examine: 'Long, yellow, nine teeth. You count them twice. You do not remember it.',
    teeth: 9, // kept current by src/engine/House.js
    drawIcon(c, size) {
      const teeth = items.bonekey.teeth ?? 9;
      begin(c, size); shadow(c);
      c.save(); c.translate(50, 50); c.rotate(-0.55);
      c.fillStyle = '#e9d9a6';
      // bow
      c.beginPath(); c.ellipse(-28, 0, 13, 15, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(-28, 0, 5, 7, 0, 0, Math.PI * 2); c.fillStyle = '#1b120c'; c.fill();
      // shank
      c.fillStyle = '#e9d9a6';
      c.beginPath(); c.rect(-16, -4, 58, 8); c.fill(); c.stroke();
      // teeth: nine notches along the bottom; spent ones are missing (dark)
      for (let i = 0; i < 9; i++) {
        const x = -8 + i * 6;
        if (i < teeth) { c.beginPath(); c.rect(x, 4, 4, 7 + (i % 3) * 2); c.fillStyle = '#e9d9a6'; c.fill(); c.stroke(); }
        else { c.beginPath(); c.rect(x, 4, 4, 2); c.fillStyle = '#5a4a2c'; c.fill(); c.stroke(); }
      }
      c.restore(); c.restore();
    },
  },
  lantern: {
    name: 'The lantern',
    examine: 'A guest lantern, already lit. By its light the varnish gives things up.',
    drawIcon(c, size) {
      begin(c, size); shadow(c);
      // handle
      c.beginPath(); c.arc(50, 24, 12, Math.PI, 0); c.strokeStyle = INK; c.stroke();
      // cap
      c.fillStyle = '#4a4440'; c.beginPath(); c.moveTo(34, 30); c.lineTo(66, 30); c.lineTo(60, 22); c.lineTo(40, 22); c.closePath(); c.fill(); c.stroke();
      // body (glass)
      const g = c.createRadialGradient(50, 56, 2, 50, 56, 22);
      g.addColorStop(0, '#fff2b8'); g.addColorStop(0.6, '#f0a640'); g.addColorStop(1, '#8a4a16');
      c.fillStyle = g; c.beginPath(); c.rect(36, 30, 28, 44); c.fill(); c.stroke();
      // bars
      c.beginPath(); c.moveTo(43, 30); c.lineTo(43, 74); c.moveTo(57, 30); c.lineTo(57, 74); c.stroke();
      // base
      c.fillStyle = '#4a4440'; c.beginPath(); c.rect(33, 74, 34, 8); c.fill(); c.stroke();
      // flame
      c.fillStyle = '#fff6c8'; c.beginPath(); c.moveTo(50, 44); c.quadraticCurveTo(57, 54, 50, 64); c.quadraticCurveTo(43, 54, 50, 44); c.fill();
      c.restore();
    },
  },
  wrench: {
    name: 'Tension wrench',
    examine: "A locksmith's third hand. This one has A.F. filed into it.",
    drawIcon(c, size) {
      begin(c, size); shadow(c);
      c.save(); c.translate(50, 50); c.rotate(0.6);
      c.fillStyle = '#8f949a';
      c.beginPath(); c.rect(-34, -3, 56, 6); c.fill(); c.stroke();
      c.beginPath(); c.rect(22, -3, 6, 18); c.fill(); c.stroke();
      c.fillStyle = INK; c.font = '600 9px Inter, sans-serif'; c.fillText('A.F.', -22, -6);
      c.restore(); c.restore();
    },
  },
  slip: {
    name: 'The call-out slip',
    examine: '9 Vesper Lane. Client locked in. Night locksmith No. 1031: that is you, apparently.',
    drawIcon(c, size) {
      begin(c, size); shadow(c);
      c.save(); c.translate(50, 50); c.rotate(-0.12);
      c.fillStyle = '#efe4c8'; c.beginPath(); c.rect(-24, -32, 48, 64); c.fill(); c.stroke();
      c.strokeStyle = '#7a2a1a'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-16, -20); c.lineTo(16, -20); c.moveTo(-16, -12); c.lineTo(10, -12); c.moveTo(-16, -4); c.lineTo(14, -4); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-16, 8); c.lineTo(12, 8); c.moveTo(-16, 16); c.lineTo(6, 16); c.stroke();
      c.fillStyle = '#7a2a1a'; c.font = '700 9px Inter, sans-serif'; c.fillText('1031', -12, 28);
      c.restore(); c.restore();
    },
  },
  hatpin: {
    name: 'Hatpin',
    examine: "Steel, eight inches, a jet bead. A lady's pick.",
    drawIcon(c, size) {
      begin(c, size); shadow(c);
      c.save(); c.translate(50, 50); c.rotate(-0.8);
      c.strokeStyle = '#8f949a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-34, 0); c.lineTo(36, 0); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-34, 0); c.lineTo(36, 0); c.stroke();
      c.beginPath(); c.moveTo(36, 0); c.lineTo(42, 0); c.lineWidth = 2; c.strokeStyle = '#d0d4d8'; c.stroke();
      const g = c.createRadialGradient(-36, -3, 1, -34, 0, 9);
      g.addColorStop(0, '#5a5560'); g.addColorStop(1, '#0e0a0c');
      c.fillStyle = g; c.beginPath(); c.arc(-34, 0, 8, 0, Math.PI * 2); c.fill(); c.strokeStyle = INK; c.lineWidth = 2.2; c.stroke();
      c.restore(); c.restore();
    },
  },
  blank: {
    name: 'A key blank',
    examine: 'A blank. Yellow. Nine positions, nothing cut. You would rather not think about where they get them.',
    drawIcon(c, size) {
      begin(c, size); shadow(c);
      c.save(); c.translate(50, 50); c.rotate(-0.55);
      c.fillStyle = '#efe2b4';
      c.beginPath(); c.ellipse(-28, 0, 13, 15, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(-28, 0, 5, 7, 0, 0, Math.PI * 2); c.fillStyle = '#1b120c'; c.fill();
      c.fillStyle = '#efe2b4';
      c.beginPath(); c.rect(-16, -4, 58, 14); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(43,26,16,0.35)'; c.lineWidth = 1;
      for (let i = 0; i < 9; i++) { const x = -8 + i * 6; c.beginPath(); c.moveTo(x, 4); c.lineTo(x, 10); c.stroke(); }
      c.restore(); c.restore();
    },
  },
  page: {
    name: "Miss Pell's page",
    examine: 'One leaf from the ledger. Thirty-one lines, twenty-eight struck through. Three are yours now.',
    drawIcon(c, size) {
      begin(c, size); shadow(c);
      c.save(); c.translate(50, 50); c.rotate(0.08);
      c.fillStyle = '#e6d8b4'; c.beginPath();
      c.moveTo(-26, -34); c.lineTo(26, -34); c.lineTo(26, 34); c.lineTo(-20, 34); c.lineTo(-26, 28); c.closePath(); c.fill(); c.stroke();
      c.lineWidth = 1.1;
      for (let i = 0; i < 9; i++) {
        const y = -26 + i * 7;
        c.strokeStyle = INK; c.beginPath(); c.moveTo(-18, y); c.lineTo(10 + (i % 3) * 3, y); c.stroke();
        if (i < 8) { c.strokeStyle = '#7a2a1a'; c.beginPath(); c.moveTo(-19, y + 0.5); c.lineTo(14, y - 0.5); c.stroke(); }
      }
      // the torn edge
      c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath();
      for (let y = -34; y < 30; y += 4) c.lineTo(-26 + (y % 8 === 0 ? 2 : 0), y);
      c.stroke();
      c.restore(); c.restore();
    },
  },
  wickkey: residentKey('wickkey', "Mr. Wick's key", 'Nine teeth, No. 88 on the bow.', 9, '88'),
  pellkey: residentKey('pellkey', "Miss Pell's key", 'Nine teeth, No. 203 on the bow. It has never been turned.', 9, '203'),
  finchkey: residentKey('finchkey', "Mr. Finch's key", 'Three teeth, No. 417 on the bow. One short of the front door.', 3, '417'),
};

/** The residents' keys on the cabinet hooks: the yellow key's shape, iron-grey, a badge number stamped on the bow. */
function residentKey(id, name, examine, teeth, number) {
  return {
    name, examine, teeth, number,
    drawIcon(c, size) {
      begin(c, size); shadow(c);
      c.save(); c.translate(50, 50); c.rotate(-0.55);
      c.fillStyle = '#9a9690';
      c.beginPath(); c.ellipse(-28, 0, 13, 15, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(-28, 0, 5, 7, 0, 0, Math.PI * 2); c.fillStyle = '#1b120c'; c.fill();
      c.fillStyle = '#9a9690';
      c.beginPath(); c.rect(-16, -4, 58, 8); c.fill(); c.stroke();
      for (let i = 0; i < 9; i++) {
        const x = -8 + i * 6;
        if (i < teeth) { c.beginPath(); c.rect(x, 4, 4, 7 + (i % 3) * 2); c.fillStyle = '#9a9690'; c.fill(); c.stroke(); }
        else { c.beginPath(); c.rect(x, 4, 4, 2); c.fillStyle = '#4a4640'; c.fill(); c.stroke(); }
      }
      c.rotate(0.55); c.fillStyle = INK; c.font = '700 7px Inter, sans-serif'; c.textAlign = 'center'; c.fillText(number, -30, -14);
      c.restore(); c.restore();
    },
  };
}
