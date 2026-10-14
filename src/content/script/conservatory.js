// Lines for the conservatory. Shapes and helpers: ./common.js. Which key fires where: docs/SLICE.md, docs/GAME.md.
import { T, F, N } from './common.js';

/** Set true once every key GAME.md §11 lists for this room is here; scripts/script-check.mjs then requires them. */
export const complete = true;

export const lines = {
  // ───────────────────────────────────────────── conservatory
  'conservatory.intro': [
    F('Evening. You\'ll be the new one.'),
    F('Abel Finch. Night locksmith, same as you. Called out in seventy-four. Came in through that door you came in through.'),
    N('He talks around the gaps in his teeth, carefully, like a man crossing a stream on stones.'),
    F('Mind the moths. They\'re not mine. They just know a warm thing when they see one.'),
  ],
  'early.conservatory': [F('Have a look round. It\'s all dead but it\'s all still here, which is more than you can say for most places.')],
  'idle.conservatory': [
    [F('Fifty-two years. The glass still needs cleaning. I\'ve stopped minding.')],
    [F('I used the yellow one four times. Didn\'t seem like much, at the time.')],
    [F('She\'s fair, Mrs. Tallow. That\'s the trouble with her.')],
    [F('If you get out, don\'t look back at the house. It likes that too much.')],
    [N('A moth lands on his cheek. He lets it.')],
    [F('My van\'s probably still out there. Rusted to the kerb. Good van.')],
  ],

  // Finch's bag
  'hint.bag.1': [F('It\'s my bag. Combination\'s on me somewhere. Everything is, eventually.')],
  'hint.bag.2': [F('The badge. They give you a number. You get used to it.')],
  'hint.bag.3': [F('Four, one, seven. Say it to yourself. It helps.')],
  'react.bag.pick': [N('The lock drops open like it has been waiting.'), F('Four one seven. There it is.')],
  'react.bag.ring': [T('I have never opened this. He never asked.'), T('Noted.')],
  'react.bag.force': [N('The yellow key finds a keyhole that is not there. The dials spin and stop on nothing.')],
  'react.finch.badge': [N('A brass badge pinned to the blanket. NIGHT LOCKSMITH, it says. No. 417.')],
  'react.wrench.found': [N('A tension wrench, hand-bent, the initials A.F. filed into it. He will not need it now.')],
  'react.matchbox': [N('A matchbox. Inside, in cotton wool, six small teeth.'), N('Not his first set.')],

  // the garden door
  'hint.garden.1': [F('Pins. Five. The ones that hold stay up, and when they drop, count how many held. The lock tells you that much.')],
  'hint.garden.2': [F('Middle one first. Then the far left. After that, count the drops.')],
  'hint.garden.3': [F('Three, one, four, two, five. I had it. I had it in seventy-four.')],
  'react.garden.nowrench': [N('A pin lock. You need something to hold tension, and your good wrench is in the van.')],
  'react.garden.pick': [N('The fifth pin sets with a click you feel in your fingers. The cylinder turns. Rain comes in.')],
  'react.garden.ring': [T('The garden is outside my keeping. Mind the step.'), T('Noted.')],
  'react.garden.force': [N('The yellow key goes into a lock it was not cut for and turns it like a wrist.')],
  'react.garden.drop': ['The pins drop with one small click.', 'All of them fall. You start again.', 'Wrong one. They let go together.'],
  // a wrong pin, by how many had held before it (the lock's own feedback; fired by _pressPin)
  // (string pools: _pressPin picks one, never the same one twice running for the same count)
  'react.garden.drop.0': ['Nothing held. That one does not go first.', 'It drops before anything sets. Not that one to start.', 'Nothing stays up. Start somewhere else.'],
  'react.garden.drop.1': ['One held. The second dropped it.', 'The first stays up, then the wrong one brings it down. One.', 'One set, and then not. Back to nothing.'],
  'react.garden.drop.2': ['Two held. The third dropped them.', 'Two up, and the next one lets them both go.', 'Two set. The third was not the third.'],
  'react.garden.drop.3': ['Three held. The fourth dropped them.', 'Three up. The fourth one brings them all down.', 'Three set, and then the wrong one. All of them fall.'],
  'react.garden.drop.4': ['Four held. The last one dropped them.', 'Four up, and the last one was not that.', 'Four set. So close it clicks, and then nothing.'],

  // Finch and the lantern
  'choice.finch.lantern': {
    prompt: [F('That lantern. Would you leave it? They like it. I like them liking it.')],
    options: [
      { text: 'Leave it with him', reply: [F('Kind. The pins are three, one, four, two, five. For the light.'), N('The moths move to him all at once, like a decision.')] },
      { text: 'Keep it', reply: [F('Fair enough. You\'ll want it later. Everybody does.')] },
    ],
  },
  'react.finch.lantern.given': [N('The lantern sits on his side table. The dark you walked in through is yours again.')],

  // Finch and the door
  'choice.finch.out': {
    prompt: [N('Mr. Finch is on his feet. He has not been on his feet in some time.'), F('Hold it for me?')],
    options: [
      { text: 'Hold it open for him', reply: [F('Obliged. Don\'t look back at the house when you go. It likes that too much.')] },
      { text: 'Let it shut', reply: [F('No. Fair enough. Not your job.')] },
    ],
  },
  'react.finch.out': [N('He goes past you into the rain and does not look back at the house.'), N('Mr. Finch is in the garden. The house has noticed.')],
  'react.finch.stays': [N('He sits back down. The blanket arranges itself.'), N('Mr. Finch is in his chair. The moths settle.')],
  'react.tallow.finch': [T('He isn\'t finished.')],

  // conservatory delights
  'caption.fountain': 'Dry. A stone fish, mouth open, waiting.',
  'caption.fountain.coin': 'At the bottom, a coin. 1974. Somebody made a wish and it was granted the way wishes are.',
  'caption.can': 'Empty. Tilting it produces a moth.',
  'caption.thermometer': 'Fifty-five degrees, and has been since the glass was put in.',
  'caption.orchid': 'Somebody loved this once, every day, for a while.',
  'caption.moon': 'The moon, through rain. Closer than it was in the hall.',
  'caption.cup': 'Tea. Cold since 1974. A skin on it like a drumhead.',
};
