// Lines for the cellar and the front door at midnight. Shapes and helpers: ./common.js. Keys this room owns:
// docs/GAME.md §11 "Cellar". The settling, the stair choices, the door lines and the card lines are shared and live in
// common.js; this file has the room, the cabinet, the wall, the residents down here, and the few extras the room needs.
import { T, P, W, N } from './common.js';

/** Every key GAME.md §11 lists for this room is here; scripts/script-check.mjs requires them. */
export const complete = true;

export const lines = {
  // ───────────────────────────────────────────── the room
  'cellar.intro': [
    T('Here we are. The book is open at your page.'),
    T('Anything you brought pays a line. The furnace takes it from there.'),
    N('Behind her, the wall. Brass, by the row, and a plate with nothing on it yet but a date.'),
  ],
  // a later night: said before 'cellar.intro'. Your old nights are on the wall; tonight's plate is new and blank, so
  // nothing here may say the plate kept anything.
  'cellar.again': [
    N('You have been here. The wall says so: a row of brass with your number on it.'),
    T('Welcome back. They cut a new plate for every night; tonight’s is the one with only a date.'),
  ],
  'early.cellar': [T('Look at the wall first. Everyone does.')],
  'idle.cellar': [
    [T('The clock is through the floor. It will wait; that is what it is for.')],
    [T('Three on the wall, by year. The cabinet was made by somebody who could count.')],
    [N('The furnace draws. The heat is dry and goes straight to the back of your throat.')],
    [T('The stair is behind you. It has been behind you all night.')],
    [T('If you are waiting for the house to say something, it has. It said it at the door.')],
    [N('She turns a page, and turns it back. Yours is the one that matters.')],
  ],
  'caption.floor': 'The clock, through the floor. It is the only thing in the house that waits for you.',
  'caption.furnace': 'Warm through the iron. It only takes what has been paid on the book: put a thing on the ledger first.',
  'caption.books': [
    '1958. Thirty-one lines, twenty-eight struck through. Somebody has been thorough.',
    '1931. A thin year. He did not stay long enough to owe.',
    '1974. Three lines, and three marks in the margin like teeth.',
  ],
  'caption.scuttle': 'Coal, and under it a dial from a lock you did not open.',
  'react.bell.cellar': [T('I am here.'), N('She does not write anything down. You check.')],

  // ───────────────────────────────────────────── the key cabinet
  'hint.cabinet.1': [T('Their keys are in the glass cabinet on your right, between the ledgers.'), T('The wall knows them by number. The cabinet knows them by less.')],
  'hint.cabinet.2': [T('The last of everything. The last of each number, in the order they came.')],
  'hint.cabinet.3': [T('Eight, three, seven. I had hoped not to say it aloud.')],
  'react.cabinet.pick': [N('The third counter settles and the glass swings. Four hooks, three keys, and a label with your number on it.')],
  'react.cabinet.ring': [T('You ring for it standing at the book. That saves us both a walk. Noted.')],
  'react.cabinet.force': [
    N('The key goes into a hole meant for a watch key. The glass stars and stays in its frame.'),
    T('One tooth fewer, which at this hour you have been counting.'),
  ],
  'caption.take.wickkey': 'WICK on the bow, No. 88, nine teeth. It wants to go back to him, not up the stair.',
  'caption.take.pellkey': 'PELL on the bow, No. 203, nine teeth and not a mark on them. Somebody down here should have it.',
  'caption.take.finchkey': 'FINCH on the bow, No. 417, three teeth. He is not down here to give it to.',
  // where he is, by the house (the room picks one): in his chair in the conservatory, or out through the garden door
  'caption.take.finchkey.chair': 'FINCH, No. 417, three teeth. He never comes down; he is in his chair in the conservatory.',
  'caption.take.finchkey.garden': 'FINCH, No. 417, three teeth. He went out through the garden. It will not reach him down here.',
  'caption.fourth': 'Tonight’s date and your number, already on the label. The house does not expect to be wrong.',
  'caption.cabinet': 'Three keys on hooks labelled WICK, PELL and FINCH, a fourth with your number. Three counters lock it.',
  'caption.cabinet.open': 'The glass stands open. Take a key, then give it to its owner.',
  'hint.cellar.keys': [T('Their keys are on the hooks in the cabinet, with their names. Take one and give it to whoever it belongs to.')],
  'caption.cabinet.engraving': 'THE HOUSE KEEPS THE LAST OF EVERYTHING. Cut deep, and polished since.',

  // ───────────────────────────────────────────── the residents down here
  'react.wick.key': [W('Nine. I counted them from the bench every night; thank you.')],
  'react.pell.key': [P('Oh. I had not thought it was still here.')],
  // a resident clicked while their key is still on its hook (once each): where it is
  'react.wick.ask': [W('My key is in the glass cabinet across from the furnace, on the hook with my name. Nine teeth. I would like it back.')],
  'react.pell.ask': [P('Mine is in the cabinet with the others, on a hook with my name. I never liked to ask her for it.')],
  'react.key.wrong': [T('That is not theirs. The hooks are labelled for a reason.')],
  'react.pell.here': [
    [P('I do not mind the heat. I minded the parlour.')],
    [P('She keeps a good book. I kept a better one, and here I am.')],
    [P('Stand under your own plate when you have one. It is only polite.')],
  ],
  'react.wick.here': [
    [W('Nine teeth and a label. They have had it ready since 1931.')],
    [W('Do not ring for the door. I did, once. That is the whole story.')],
    [W('I picked everything in this house but the one thing that mattered.')],
  ],
  'react.pay.nothing': [T('Nothing on your page wants paying. Keep it; you will want a spare.')],

  // ───────────────────────────────────────────── the memorial wall
  'caption.plate.wick': 'T. WICK, No. 88. He picked the lot and left clean, then came back for the front door. It kept him.',
  'caption.plate.pell': 'D. PELL, No. 203. Thirty-one favours, written in her hand, which was neater than the house’s.',
  'caption.plate.finch': 'A. FINCH, No. 417. Three teeth, one short of the door. The plate does not say which three.',
  'caption.plate.night': 'A night you have had. The house keeps the last line; you kept the rest.',
  'caption.blank': 'Tonight’s date, already cut. The rest is for later.',

  // ───────────────────────────────────────────── midnight
  'react.door.street': [N('Rain on the step. The van has its hazards on; it has had them on since 11:41.')],
};
