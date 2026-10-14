// Shared lines: the verbs, the call, the settling, the front door, the card. Room-owned lines live in ./<room>.js.
// Shapes: lines = [{who,text},…]; pool = [lines, lines, …] (one picked at random); caption = string or [strings];
// choice = { prompt: lines, options: [{ text, reply: lines }, { text, reply: lines }] }.
// Lines are one or two sentences. Nobody exclaims. Speakers: tallow, finch, pell, wick, narrator.

export const T = (text) => ({ who: 'tallow', text });
export const F = (text) => ({ who: 'finch', text });
export const P = (text) => ({ who: 'pell', text });
export const W = (text) => ({ who: 'wick', text });
export const N = (text) => ({ who: 'narrator', text });

export const lines = {
  // ───────────────────────────────────────────── verbs, first and after
  'react.ring.first': [
    T('You rang.'),
    N('She comes without hurrying, and still sooner than the walk should take.'),
    T('I will open it. That is one favour, and it goes in the ledger on the table. The house collects at midnight.'),
  ],
  'react.ring.again': [
    [T('You rang.')],
    [T('Again. Very well.')],
    [T('I was on my way. I am always on my way.')],
    [N('She was on her way before you rang. She usually is.')],
  ],
  // a second ring when she is already standing in the room (House.js asks the room's tallowHere())
  'react.ring.here': [
    [T('You rang.')],
    [T('Again. Very well.')],
    [T('I was standing right here. You may simply ask.')],
    [N('She does not have far to come. She makes it look like further.')],
  ],
  'react.force.first': [
    N('The key is a little shorter. You run your tongue along your teeth and count.'),
    N('You count again.'),
  ],
  // said in order, one per force after the first (House.js rotates them; never the same twice running)
  'react.force.again': [
    [N('It turns like it has turned a hundred times. Perhaps it has.')],
    [N('One tooth fewer on the key. You do not count this time.')],
    [N('The key gets lighter. So does your jaw.')],
    [N('Another tooth. The gap on the key is getting easier to find with your tongue.')],
    [N('The lock gives. The key gives a little more.')],
  ],
  // the opening of a force line on a lock with no keyhole ({nohole} in react.<lock>.force): House.js fills it in by the
  // number of teeth already spent, so two forces running never open the same way
  'react.force.nohole': ['There is no keyhole.', 'Nothing on it takes a key.', 'There is nowhere for a key to go.'],
  // the force that leaves four teeth: the next one is the chair (instead of react.force.again)
  'react.force.four': [N('Four left. The door wants four; the next one buys you a chair in the conservatory.')],
  'caption.nope': ['That does nothing here.', 'No.', 'The house declines.'],
  // an item used on something with no use for it, or on nothing at all (Interaction.js); the item stays in your hand
  'caption.nope.item': ['Not there.', 'It does not fit there.', 'The house has no use for that, there.', 'Not that, and not there.'],
  // the first lock close-up of a run (House.js focusLock): what the key costs, once, then the three ways as a caption
  'tallow.ways': [T('Pick it, ring for me, or use the yellow key. The key costs you a tooth each time, and the front door wants four left at midnight.')],
  'caption.ways': 'Pick it. Or ring for her. Or the yellow key, a tooth each time.',

  // ───────────────────────────────────────────── the call
  // after the sixth lock opens (House.js, once a night): the seventh ends the evening upstairs
  'tallow.sixth': [T('One more and the house will want you downstairs. Choose it.')],
  'tallow.call': [T('The house will see you downstairs. Leave that; it will keep.')],
  'tallow.call.empty': [T('The house will see you downstairs.')], // nothing in your hand to leave
  // said after the room's afterCall (the foyer opens the baize door), wherever the call finds you
  'tallow.call.where': [T('The baize door, by the stair. It is open.')],
  // any hint asked after the call, in any room but the cellar (Hints.js)
  'hint.called': [T('Downstairs. The baize door, by the stair in the hall. It is open, and the house is waiting.')],
  'caption.nope.late': 'Not tonight.',
  'choice.bell': {
    prompt: [T('Yes?')],
    options: [
      { text: 'A hint', reply: [T('Very well.')] },
      { text: 'The cellar', reply: [T('You are early. The house does not mind early.'), T('Noted.')] },
    ],
  },
  'react.bell.early': [N('She writes it down before you have finished asking. Early is a favour, apparently.')],

  // ───────────────────────────────────────────── the settling
  // House.js puts the thing paid in for {item} ("The wrench goes into the furnace…")
  'react.pay': [T('Paid.'), N('{item} goes into the furnace without a sound. The line is struck through in a hand you recognise.')],
  'react.pay.page': [N('Three more lines, in a neater hand. Then one fewer.')],
  'react.pay.key': [T('That is not yours to pay with. Keep it in your pocket, or give it to its owner.')],
  'react.pay.bonekey': [T('The key is not yours to burn. It goes back in your pocket.')],
  'choice.tally': {
    prompt: [T('Miss Pell has room.')],
    options: [
      { text: 'Put one on her page', reply: [T('Noted.'), N('The line moves. It takes nothing with it that you can see.')] },
      { text: 'Keep it', reply: [T('As you like. It is your name on it.')] },
    ],
  },
  'react.pell.tally': [P('No trouble at all. Noted.')],
  'react.pell.caught': [N('She hears herself. She does not take it back.')],
  'react.key.back': [N('Your pocket is lighter. Across the room, a hook is not.')],
  'choice.stair.owed': {
    prompt: [T('There are lines in the book.')],
    options: [
      { text: 'Go up (the door, whatever the book says)', reply: [T('Very well. The house will read them to you at the door.')] },
      { text: 'Stay and settle', reply: [T('Sensible. The book is open on the table.')] },
    ],
  },
  'choice.stair.up': {
    prompt: [T('Up, then? The door will not wait for you twice.')],
    options: [
      { text: 'Go up', reply: [T('Mind the ninth step.')] },
      { text: 'Stay a while', reply: [T('The book is open on the table.')] },
    ],
  },
  'choice.stair.teeth': {
    prompt: [T('It wants four. You may go up and try; the house enjoys that.')],
    options: [
      { text: 'Go up (the door, whatever the key says)', reply: [N('You count them again on the stairs. The number does not change.')] },
      { text: 'Stay', reply: [T('Nothing down here restores a tooth. But stay, by all means.')] },
    ],
  },

  'react.ledger.how': [T('Anything you brought pays a line. Put it on the book.')],

  // ───────────────────────────────────────────── night 2 and after
  // Dialogue.js: when the memorial has a plate, '<key>.night2.<last ending>' (else '<key>.night2') replaces the FIRST
  // line of '<key>'. Only 'foyer.intro' has variants; the foyer says 'foyer.intro' as before.
  'foyer.intro.night2': [T('A locksmith. Again. The house remembers you, even if you do not.')],
  'foyer.intro.night2.staff': [T('A locksmith. Last year you left in an apron; the house has kept it pressed.')],
  'foyer.intro.night2.teeth': [T('A locksmith. The chair in the conservatory is still warm, if that is a comfort.')],
  'foyer.intro.night2.tally': [T('A locksmith. Miss Pell asked after you. Her page is longer than it was.')],
  'foyer.intro.night2.procession': [T('A locksmith. The step was crowded last year. The house has counted it twice since.')],
  'foyer.intro.night2.finch': [T('A locksmith. Mr. Finch sent nothing, which from him is a great deal.')],
  'foyer.intro.night2.paid': [T('A locksmith. You paid in full last year. The house has been thinking about it.')],
  'foyer.intro.night2.clean': [T('A locksmith. Nothing owed, last year. The house has thought about little else.')],

  // ───────────────────────────────────────────── the front door at midnight
  // before the apron, when lines are unpaid: midnight.js reads the count in ({n} = "One line" / "Two lines" …), keeping
  // Tallow's promise on the stair ("The house will read them to you at the door")
  'react.door.read': [N('{n}. The house reads them out to you at the door, one by one, and waits.')],
  'react.door.read.one': [N('One line. The house reads it out to you at the door, and waits.')],
  'react.door.staff': [N('The handle is cold. On the hook by the baize door there is an apron, and your number is on it.')],
  'react.door.teeth': [N('The key goes in and stops.'), T('There is a chair in the conservatory.')],
  'react.door.open': [N('The twelfth strike lands as the key goes in. It turns, which is the strangest thing that has happened tonight.')],
  'react.wick.door': [W('Allow me. It has been some time.'), N('His hand goes over yours on the key, and the door opens for both of you.')],
  'react.pell.door': [P('Noted.'), N('She says it to the street, and the street does not write it down.')],
  'react.finch.van': [F('You took your time. So did I.'), N('He is by the van, in the rain, not looking at the house.')],

  // ───────────────────────────────────────────── the card
  'card.staff': 'The apron fits. It was always going to.',
  'card.teeth': 'There is a chair in the conservatory. The moths will find you.',
  'card.tally': 'Thirty-four lines on her page. She does not look up.',
  // the count is you and whoever is on the step with you (src/logic/house.js cardLine)
  'card.procession': 'Three on the step, and the house counts them, and lets it go.',
  'card.procession.two': 'Two on the step, and the house counts them, and lets it go.',
  'card.finch': 'He is by the van and not looking at the house. Neither, you find, are you.',
  'card.paid': 'You leave without your pliers. The van has a spare. The house has yours.',
  'card.paid.teeth': 'Nothing in the book. You run your tongue along the gap and count again.',
  'card.clean': 'Nothing owed. The house finds that hard to forgive. Same night next year.',
};
