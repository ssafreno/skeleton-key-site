// Lines for the parlour. Shapes and helpers: ./common.js. Keys this room owns: docs/GAME.md §11 "Parlour".
// Miss Dorothea Pell, 1958, No. 203: small, neat, over-polite. She says "Noted." in Tallow's voice and hears herself.
import { T, P, N } from './common.js';

/** Set true once every key GAME.md §11 lists for this room is here; scripts/script-check.mjs then requires them. */
export const complete = true;

export const lines = {
  // ───────────────────────────────────────────── the parlour
  'parlour.intro': [
    P('Oh, you\'re the locksmith; I was the locksmith. Do sit, nobody else does.'),
    N('She does not take one herself. Staff stand.'),
    P('Dorothea Pell. Number two hundred and three. The house keeps me on, which is kind of it, and I keep the parlour.'),
  ],
  'early.parlour': [P('Have a look round, do. Everything is where it should be; that is rather the point of me.')],
  'idle.parlour': [
    [P('I\'d ring for tea, but I\'ve stopped ringing. It is the one thing I have managed.')],
    [P('Twenty-eight crossed out. Service rendered, it says. I never saw the services.')],
    [P('Mind the table. It\'s laid.')],
    [P('The fire is laid every evening and lit on none of them. One has to have something to do.')],
    [P('She was very fair about it. She is always very fair. I have come to think that is the trick.')],
    [N('She dusts the same six inches of mantel, and then the same six inches again.')],
  ],

  // ───────────────────────────────────────────── the tea caddy
  'hint.caddy.1': [P('Staff keep their own things in the caddy. The house is particular about pockets.')],
  'hint.caddy.2': [P('Tea was at a quarter past. The mantel clock stopped when I stopped asking, and the time is on it if you can see it.')],
  'hint.caddy.3': [P('A quarter past four, on the little hands. I shouldn\'t, but there.')],
  'react.caddy.pick': [N('The hands meet the hour and something inside agrees. The lid lifts on its own weight.')],
  'react.caddy.ring': [T('Her own things. I shall say she asked me, and she will not contradict it.'), T('Noted.')],
  'react.caddy.force': [N('A keyhole the size of a pin. The key does not care. The lid splits along the grain and gives.')],
  'react.hatpin.found': [N('Steel, eight inches, a jet bead. A lady\'s pick, and she has not needed it in some time.')],
  'react.badge': [N('NIGHT LOCKSMITH · No. 203. LOCKSMITH has been filed off and STAFF struck in over it, not quite straight.')],

  // ───────────────────────────────────────────── the shutters
  'hint.shutters.1': [P('Four levers, each likes a height from one to three. Try the knob: the bolt stops at the first lever that is wrong.')],
  'hint.shutters.2': [P('I lay the same hand every evening. Nobody has played it, so it is still on the table.')],
  'hint.shutters.3': [P('Two, three, the ace, three. Noted, I mean, there.')],
  'react.shutters.nopin': [N('You need something thin and stiff. Your picks are in the van.')],
  'react.shutters.pick': [N('The fourth gate lines up and the bolt goes across like it has been wanting to. The bar comes down in your hands.')],
  'react.shutters.ring': [T('Aired at last. She has been saying so since 1958.'), T('Noted.')],
  'react.shutters.force': [N('The bar comes down with the lock still on it, and the lock still shut.')],
  // the bolt stops at the first lever out of place, counting from the left
  'react.shutters.tick.0': 'A tick. The bolt does not move; the first lever is in its way.',
  'react.shutters.tick.1': 'It moves a quarter and stops at the second.',
  'react.shutters.tick.2': 'It moves halfway and stops at the third.',
  'react.shutters.tick.3': 'It moves three quarters and stops at the fourth.',
  'react.tallow.parlour': [T('Miss Pell is the one to ask in here. She was very good, once.')],
  'react.tallow.parlour.after': [T('She kept this room for sixty-eight years. It will keep itself now.')],

  // ───────────────────────────────────────────── Miss Pell and the lantern
  'choice.pell.lantern': {
    prompt: [P('May I have your lantern? Not for me: for the table. They might come to a light, and I have the table laid.')],
    options: [
      { text: 'Leave it with her', reply: [P('For when they come. Thank you.'), P('Two, three, the ace, three. For the light.')] },
      { text: 'Keep it', reply: [P('Of course. It was not mine to ask for, and I have asked for enough.')] },
    ],
  },
  'react.pell.lantern.given': [N('The lantern sits in the middle of the card table, between the four hands. The mantel clock goes back into its smoke.')],

  // ───────────────────────────────────────────── the page
  'choice.pell.page': {
    prompt: [
      N('Moonlight across the chintz, for the first time in sixty-eight years. Miss Pell stands very straight.'),
      P('My page in her book has three lines left on it, in her hand. Take it, and those three are yours to settle.'),
    ],
    options: [
      { text: 'Take her page, and her three lines', reply: [P('Then the three are yours to settle, and I am clear of them. Noted.'), P('No. I mean, thank you.')] },
      { text: 'Leave it', reply: [P('Of course. It was a great deal to ask, and you let me ask it. The house never has.')] },
    ],
  },
  'react.pell.taken': [N('She puts her duster down. It is the first thing she has put down all night.')],
  'react.pell.left': [N('She picks the duster back up, and the six inches of mantel.')],
  'react.page': [N('One leaf from the ledger, in your pocket. Thirty-one lines, twenty-eight struck through. Three are yours now.')],
  'react.tallow.pell': [T('Mind she does not catch cold.')],
  'react.pell.down': [P('That will be for me. I shan\'t keep her waiting; one doesn\'t.')],
  'react.pell.stays': [P('Not for me, that one. I shall keep the parlour.')],

  // ───────────────────────────────────────────── delights
  'caption.mantel.dark': 'A mantel clock under a dome gone the colour of smoke. The hands are in there somewhere.',
  'caption.mantel.lit': 'Held to the lantern, the dome gives up its hands: a quarter past four, and has been for some time.',
  'caption.shutters.wrap': 'Lifted past the third notch, the lever drops back to the first.',
  'caption.cards': 'The same four every night. Nobody has come to play them.',
  'caption.gramophone': 'Wound, not playing. She winds it every evening so it will be ready.',
  'caption.mirror': 'The room behind you, laid for four. She is in it; you are not.',
  'caption.sampler.parlour': 'ASK AND IT SHALL BE GIVEN. The thread has gone the colour of tea.',
  'caption.hat': 'A hat with a hole where the pin was.',
  'caption.bellpull': 'A tassel worn to the cord. The cord worn to the wire.',
  'caption.fire': 'Laid, with paper under the kindling. Nobody has put a match to it since the paper was news.',
  'caption.gaslamp': 'Turned down as far as it goes without going out. Somebody is saving on the gas.',
  'caption.caddy.dial': 'Left of the brass line turns the short hand, an hour a click; right of it, the long hand, five minutes.',
  'caption.caddy.open': 'Rosewood, lined in lead foil. No tea.',
};
