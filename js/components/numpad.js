// On-screen number pad. Pure view: it reports presses, the screen owns the value.
//   createNumpad({ onDigit(d), onBack(), onClear() }) -> HTMLElement

import { el } from '../core/utils.js';
import { t } from '../i18n/index.js';
import { play, vibrate } from '../core/audio.js';

export function createNumpad({ onDigit, onBack, onClear }) {
  const press = (fn) => () => { play('ui'); vibrate(5); fn(); };
  const key = (label, handler, { aria, cls = '' } = {}) =>
    el('button', { type: 'button', class: `numpad__key ${cls}`.trim(), 'aria-label': aria, onClick: press(handler) }, label);

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => key(String(d), () => onDigit(d)));
  return el('div', { class: 'numpad', role: 'group', 'aria-label': t('game.answerLabel') },
    digits,
    key('C', onClear, { aria: t('game.clear'), cls: 'numpad__key--fn' }),
    key('0', () => onDigit(0)),
    key('⌫', onBack, { aria: t('game.back'), cls: 'numpad__key--fn' }));
}
