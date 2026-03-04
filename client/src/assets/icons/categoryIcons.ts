import { ScoreCategory } from '../../types/game';

import onesIcon          from './d1.png';
import twosIcon          from './d2.png';
import threesIcon        from './d3.png';
import foursIcon         from './d4.png';
import fivesIcon         from './d5.png';
import sixesIcon         from './d6.png';
import threeOfAKindIcon  from './3x.png';
import fourOfAKindIcon   from './4x.png';
import yatzyIcon         from './5x.png';
import smallStraightIcon from './smallstreet.png';
import largeStraightIcon from './largestreet.png';
import chanceIcon        from './chance.png';
import fullHouseIcon     from './fullhouse.png';

export const categoryIcons: Partial<Record<ScoreCategory, string>> = {
  ones:          onesIcon,
  twos:          twosIcon,
  threes:        threesIcon,
  fours:         foursIcon,
  fives:         fivesIcon,
  sixes:         sixesIcon,
  threeOfAKind:  threeOfAKindIcon,
  fourOfAKind:   fourOfAKindIcon,
  fullHouse:     fullHouseIcon,
  yatzy:         yatzyIcon,
  smallStraight: smallStraightIcon,
  largeStraight: largeStraightIcon,
  chance:        chanceIcon,
};
