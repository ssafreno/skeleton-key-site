// Lines for the foyer (and the landing). Shapes and helpers: ./common.js. Which key fires where: docs/SLICE.md, docs/GAME.md.
import { T, N } from './common.js';

/** Set true once every key GAME.md §11 lists for this room is here; scripts/script-check.mjs then requires them. */
export const complete = true;

export const lines = {
  // ───────────────────────────────────────────── foyer
  'foyer.intro': [
    T('A locksmith. In my house. How modern.'),
    T('The house has eleven locks it would like seen to. Every one of them opens three ways.'),
    T('Pick it, if you are good. Ring, and I will open it and write you down. Or use the yellow one on your ring, and pay for it there.'),
    N('You did not mention the yellow key. You had not noticed it yourself until she looked at it.'),
  ],
  'early.foyer': [T('Do look around. The house likes to be looked at. It is not often it gets the chance.')],
  'idle.foyer': [
    [T('I keep the house. The house keeps everything else.')],
    [T('The clocks were all stopped when I came. I have left them. It seemed rude.')],
    [T('The previous locksmiths were very capable. They are all still here, if you would like references.')],
    [T('You may ring at any time. I do not sleep, and I do not forget.')],
    [N('She stands the way furniture stands. You keep expecting her to creak.')],
    [T('That key of yours. Nine teeth. I counted while you were not looking.')],
  ],
  'toast.nudge': 'Stuck? Mrs. Tallow is standing right there. She would like to be asked.',

  // the cupboard under the stair
  'hint.cup.1': [T('There is a nail through the hasp. You have hands, and I believe tools.')],
  'hint.cup.2': [T('Pliers were invented for nails and very little else.')],
  'hint.cup.3': [T('Or ring, and I will do it, and we will both remember that I did.')],
  'react.cup.pick': [N('The nail comes out bent and warm. The little door swings on its own.')],
  'react.cup.ring': [T('A nail. Really.'), N('She pulls it with two fingers and puts it in her pocket.'), T('Noted.')],
  'react.cup.force': [N('{nohole} The yellow key goes in anyway, and turns, and something in the hasp gives up.')],
  'caption.cup.door': 'A nail through the hasp, bent over. Something inside glints through the gap. The pliers would do it.',
  'react.lantern.found': [N('A guest lantern, already lit. Nobody lit it. You take it, because it is dark, and because it was left for you.')],

  // the conservatory doors
  'hint.moons.1': [T('Four moons. The house has only ever had the one, so you will have to find the others.')],
  'hint.moons.2': [T('Painters put things in skies. Light helps.')],
  'hint.moons.3': [T('Crescent, quarter, full, quarter. I was never going to let you guess.')],
  'react.moons.pick': [N('The last dial settles and the lock gives a small brass sigh. The doors lean open.')],
  'react.moons.ring': [T('The conservatory. He will be glad of the company.'), T('Noted.')],
  'react.moons.force': [N('The yellow key does not fit a dial lock. It turns anyway. Something in the lock, or in you, cracks.')],
  'caption.painting.dark': 'A house, a sky. The varnish has gone the colour of tea.',
  'caption.painting.lit': 'By the lantern the varnish gives up four small moons, left to right. The painter wanted them found.',

  // the parlour door: four letter rings
  'hint.parlour.1': [T('That door opens for people the house expects, and it has not been told your name.')],
  'hint.parlour.2': [T('It has been told its own. It is over the front door, for the street, and the moon is kind enough to copy it out.')],
  'hint.parlour.3': [T('Rook. Spell it to the rings; you were facing the wrong way to read it, which is rather the point.')],
  'react.parlour.pick': [N('The last ring settles and the door swings inward on its own. Nobody is behind it.')],
  'react.parlour.ring': [T('The parlour. She will stand when you come in; do let her.'), T('Noted.')],
  'react.parlour.force': [N('{nohole} The yellow key makes its own, and the rings drop off one by one onto the tiles.')],
  'caption.fanlight.name': 'The house signs itself in the glass, for the street. From here it is a K, two Os and an R the wrong way round.',
  'caption.name.floor': 'ROOK, in moonlight, on the floor. The house has put its name where you would wipe your boots.',

  // the nursery door, on the landing: a knocker and four pegs
  'hint.landing.1': [T('A nursery door that locks from the outside tells you what kind of house this was.')],
  'hint.landing.2': [T('Somebody stitched the way in on that landing, as a rhyme, so a child could keep it.')],
  'hint.landing.3': [T('Two knocks, a breath, one knock, then hush. Hush means your hands stay down.')],
  'react.landing.pick': [N('The hush holds. The fourth peg rises on its own and the bolt draws back, quietly, the way it was taught.')],
  'react.landing.ring': [T('A nursery. You would think it would be the one door left unlocked.'), T('Noted.')],
  'react.landing.force': [N('The key goes in beside the pegs, where there is no hole, and the pegs drop together. The sampler slips a quarter inch on its nail.')],
  'react.tallow.stairs': [T('I do not go up, as a rule. The house does not.')],
  'caption.sampler': 'KNOCK AND KNOCK, THEN COUNT A SHEEP; KNOCK ONCE MORE, AND HUSH, AND SLEEP. E.V., aged seven, 1899.',
  'caption.sampler.far': 'Something stitched, under glass, too far to read.',
  'caption.pegs.drop': ['The pegs drop with a click.', 'Wrong moment. The pegs let go together.', 'The pegs fall. The door was listening.'],

  // the stair, the rope, the baize door, the side door
  'react.rope': [N('Warm. Somebody has been holding it.')],
  'react.stair': [N('The rope is across the third step. It would not stop a child. It is not meant to.')],
  'react.stair.up': [N('Thirteen. You count them because the house would like you to.')],
  'react.stair.down': [N('Thirteen again. The number does not change on the way down, which is something.')],
  'react.baize': [T('Not yet.')],
  'react.sidedoor': [N('Round the house, through the wet, to a side door that was never locked. The house finds that funny.')],
  'caption.hook': 'A hook with nothing on it. You notice it on the way down.',
  'caption.baize.open': 'The baize door stands open on a stair going down. A warmth comes up it that the house has not had all night.',
  'caption.plan': 'A plan of the house, by the door. The rooms you have stood in are drawn lit. The others are only drawn.',

  // foyer objects
  'react.frontdoor': [N('The handle is cold enough to hurt. The door does not move. It is the one lock you were not sent for.')],
  'react.frontdoor.key': [N('The yellow key will not go in. Not yet.')],
  'react.parlour': [N('No keyhole, no handle. The door is not interested in what you are holding.')],
  'react.clock': [N('It says 11:41. It has said so for some time.')],
  // the room puts the time in front of it: "11:43. The pendulum is moving now. ..."
  'react.clock.running': [N('The pendulum is moving now. You did that, apparently.')],
  'react.bell.idle': [N('She was behind you. She was not behind you a moment ago.')],
  'react.ledger.empty': [N('A ledger, open to a clean page with your name at the top. You did not give your name.')],
  'caption.coat': 'A good coat. A man\'s. The pockets have been sewn shut.',
  'caption.honesty': 'Honesty, dried. The seed pods are see-through. Nothing in them.',
  'caption.fanlight': 'The moon, through old glass. A cloud goes across it and takes its time.',
  // the hall bell, "The cellar": a second ask before the early call, which ends the wings
  'choice.bell.cellar': {
    prompt: [T('Downstairs is where the night is settled. Go now and the doors up here close behind you, and stay closed.')],
    options: [
      { text: 'Go down now (the wings close)', reply: [T('You are early. The house does not mind early.'), T('Noted.')] },
      { text: 'Not yet', reply: [T('As you like. The bell will keep.')] },
    ],
  },
  'caption.rail': 'The hall, from above. The table, the lamp, the top of her head. She does not look up.',
  'caption.nursery.open': 'The nursery door stands open at the height of a child. The wallpaper inside has lambs on it.',
};
