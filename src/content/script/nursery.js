// Lines for the nursery. Shapes and helpers: ./common.js. Keys this room owns: docs/GAME.md §11 "Nursery".
// Which key fires where: docs/GAME.md §6.
import { T, W, N } from './common.js';

/** Set true once every key GAME.md §11 lists for this room is here; scripts/script-check.mjs then requires them. */
export const complete = true;

export const lines = {
  // ───────────────────────────────────────────── the nursery, Mr. Wick
  'nursery.intro': [
    W('Thomas Wick, eighty-eight. You came up the stairs, so she let you, so she wants something seen.'),
    N('He says it to the bench. The pick in his fingers does not stop turning.'),
  ],
  'early.nursery': [W('Look round, by all means. Everything in here is where she put it, except me.')],
  'idle.nursery': [
    [W('Ninety-four years on one lock. It is not hard; it is not there at night.')],
    [W('I picked all eleven. I am told that is not the compliment it was.')],
    [W('I look, most nights, at somebody\'s van.')],
    [N('He turns the pick over once more and sets it down in its place, exactly.')],
    [W('She makes the bed. I have never slept in it, and she makes it.')],
    [W('Nine teeth, all my own. I counted the night I came back, and I count them still.')],
  ],

  // the doll's house
  'hint.dolls.1': [W('The shutters are shut because that is how she likes it.')],
  'hint.dolls.2': [W('Somebody is at three of the windows. You will want the light for that.')],
  // the same two steps when the lantern is not in your hand: the moon shows them, close to, once he has said where to look
  'hint.dolls.dark.1': [W('Somebody is at three of the windows. You have no light for it, so go close and let the moon do it; it showed me.')],
  'hint.dolls.dark.2': [W('Three little faces at the windows, by the moon. Open theirs and leave the rest shut, for their sake.')],
  'hint.dolls.3': [W('Top left, middle right, bottom left. Open those and leave the rest shut, for their sake.')],
  'react.dolls.pick': [N('The third shutter settles and the whole front leans out at you, like a door somebody is holding.'), N('Inside, to the inch, the hall you came in through.')],
  'react.dolls.ring': [T('It is the house. I would rather not.'), T('Noted.')],
  'react.dolls.force': [N('The yellow key goes into a door the size of your thumb.'), N('The little front splinters, and downstairs, faintly, so does something else.')],
  'react.blank.found': [N('A blank, yellow, lying on the little hall tiles where the ledger would be. Nothing cut.'), N('You would rather not think about where they get them.')],
  'react.torn': [N('Torn from the ledger, folded under the little stair. T. Wick, 1931: nothing owed.'), N('Under it, newer: 1932: one door, from the outside.')],

  // the mock front door
  'hint.mock.1': [W('Every tooth wants its own height and not a hair past.')],
  'hint.mock.2': [W('The drawing. I did it the first year, when I thought the drawing was the hard part.')],
  'hint.mock.3': [W('Two, three, one, three, two, and the threes you leave alone. Knowing is the cheap part.')],
  'react.mock.noblank': [N('A keyhole, and nothing in your pockets the right shape. Your blanks are in the van, in a tin.')],
  'react.mock.wrong': [N('It goes in and stops. He does not look up.')],
  'react.mock.pick': [N('It turns. The little door opens on the nursery wall, and for a moment the room is very quiet.'), W('Two, three, one, three, two. There. It was never the hard part.')],
  'react.mock.ring': [T('Mr. Wick. I will do this one, since you were not going to ask.'), T('Noted.')],
  'react.mock.force': [N('The yellow key goes into the mock door, where it fits, which is the joke. He watches, and says nothing, which is the worst he has.')],

  // Mr. Wick and the lantern
  'choice.wick.lantern': {
    prompt: [W('That lantern. Leave it on the bench a while; I have not seen the cuts by a proper light since 1932.')],
    options: [
      { text: 'Leave it with him', reply: [W('Two, three, one, three, two. I can see them now; I could always see them.')] },
      { text: 'Keep it', reply: [W('No. Fair. It was never mine to ask for.')] },
    ],
  },
  'react.wick.lantern.given': [N('The lantern sits on the baize between the picks. He does not look at it; he looks at what it shows.')],
  'react.wick.lantern.kept': [N('He looks at it the way you look at a van.')],

  // Mr. Wick and the door
  'choice.wick.down': {
    prompt: [N('Mr. Wick has put the pick down. He has not put it down in some time.'), W('Well. Is it the cellar, or do I keep the bench?')],
    options: [
      { text: 'Bring him down', reply: [W('Down, then. There is a key cabinet by the furnace, behind its own lock. The one with nine teeth is mine; I would like it back.')] },
      { text: 'Leave him', reply: [W('Sensible. I have the bench, you have the door; see that it stays that way.')] },
    ],
  },
  // the key filed past the drawing: once, he gives you another blank and the cuts start over
  'react.wick.blank': [N('He looks up after all, at the key, and then at you.'), W('There is one more blank. There is always one more blank, until there is not.'), N('He takes the filed one out of the vice and puts a fresh one in its place.')],
  'react.wick.down': [N('He stands, and is smaller standing. He takes nothing from the bench. He has looked at it enough.')],
  'react.wick.stays': [N('He sits back to the bench and the pick starts turning again, as if the door had not opened at all.')],
  'react.wick.dontcome': [W('Next year it will ask you back, for the sport. Don\'t.')],

  // delights
  'caption.dolls.dark': 'A doll\'s house. The shutters are all closed, and the front will not come off.',
  'caption.dolls.dark.open': 'A doll\'s house. Some of the shutters stand open, and the front will not come off.',
  'caption.dolls.moon': 'Close to, by the moon: three of the little windows have somebody at them. Top left, middle right, bottom left.',
  'caption.dolls.wrong': 'The front shifts against its catch, and holds. Not those three.',
  'caption.dolls.many': 'Too many windows open. The front sits tight, the way she likes it.',
  'caption.vice': 'His vice, bolted to the bench, jaws open the width of a key. It wants something the right shape.',
  'caption.vice.done': 'The vice, empty. Brass filings in the jaws, from your key.',
  'caption.mock.open': 'The little door stands open on the nursery wall. Behind it, wallpaper.',
  'caption.dolls.lit': 'By the lantern, three of the little windows have somebody at them. Top left, middle right, bottom left.',
  'caption.chart': 'The front door\'s key in profile, the teeth numbered: two, three, one, three, two. 1932, underlined once, hard.',
  'caption.window': 'Your van under the lamp, hazards going. From up here it looks like something waiting to be collected.',
  'caption.picks': 'Nine picks on green baize, laid out like surgery. One for each tooth he never spent.',
  'caption.marks': 'E., year by year, pencilled to seven. Then, much higher, in another hand: T.W., 1932.',
  'caption.horse': 'It rocks once when you look at it, and then has the decency to stop.',
  'caption.bed': 'Made with corners. Either he has never slept in it, or he makes it every morning. Both are worse.',
  'caption.lamp': 'His lamp. The shade is green so the light stays on the bench, where he wants it.',
  'caption.tallow.wick': 'Mr. Wick is the one to ask up here. He has had the years.',
};
