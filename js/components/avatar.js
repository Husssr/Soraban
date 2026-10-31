// Avatar = colour + initial (no photos).
import { el } from '../core/utils.js';
import { studentInitial } from '../core/store.js';

export function avatar(student, { size = 36 } = {}) {
  const node = el('span', { class: 'avatar', 'aria-hidden': 'true' }, studentInitial(student.name));
  node.style.background = student.color;
  node.style.width = `${size}px`;
  node.style.height = `${size}px`;
  node.style.fontSize = `${Math.round(size * 0.45)}px`;
  return node;
}

export function guestAvatar({ size = 36 } = {}) {
  const node = el('span', { class: 'avatar avatar--guest', 'aria-hidden': 'true' }, '?');
  node.style.width = `${size}px`;
  node.style.height = `${size}px`;
  node.style.fontSize = `${Math.round(size * 0.45)}px`;
  return node;
}
