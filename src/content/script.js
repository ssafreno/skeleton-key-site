// Every player-facing line, merged from src/content/script/*.js (one module per room, shared lines in common.js).
// Shapes: lines = [{who,text},…]; pool = [lines, lines, …] (one picked at random); caption = string or [strings].
// Lines are one or two sentences. Nobody exclaims. See docs/SLICE.md and docs/GAME.md for which key fires where.
import { lines as common } from './script/common.js';
import { lines as foyer } from './script/foyer.js';
import { lines as conservatory } from './script/conservatory.js';
import { lines as parlour } from './script/parlour.js';
import { lines as nursery } from './script/nursery.js';
import { lines as cellar } from './script/cellar.js';

export const MODULES = { common, foyer, conservatory, parlour, nursery, cellar };

export const script = {};
for (const [name, mod] of Object.entries(MODULES)) {
  for (const [k, v] of Object.entries(mod)) {
    if (k in script) console.warn(`[script] ${name} redefines "${k}"`);
    script[k] = v;
  }
}
