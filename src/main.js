// Boot: register rooms, init the engine, then title or ?room=.
import { Game } from './engine/Game.js';

// Order matters: the first registered room is the title-screen backdrop.
const ROOM_MODULES = [
  './rooms/foyer/index.js',
  './rooms/conservatory/index.js',
  './rooms/parlour/index.js',
  './rooms/nursery/index.js',
  './rooms/cellar/index.js',
  './rooms/midnight/index.js',
];

async function loadRooms() {
  const results = await Promise.all(ROOM_MODULES.map(async (path) => {
    try {
      const mod = await import(path);
      return mod.default || Object.values(mod).find((v) => typeof v === 'function' && v.id);
    } catch (e) {
      if (!/Failed to fetch|Importing a module script failed|error loading dynamically imported module|404/i.test(e.message)) {
        console.error(`[main] failed to load ${path}`, e);
      }
      return null;
    }
  }));
  return results.filter(Boolean);
}

const rooms = await loadRooms();
const game = new Game({ rooms, startRoom: 'foyer' });
await game.init();
await game.boot();
