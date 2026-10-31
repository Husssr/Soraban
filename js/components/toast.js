// Small non-blocking messages. The container is an aria-live region (see index.html).

import { el } from '../core/utils.js';

function getRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = el('div', { id: 'toast-root', class: 'toast-root', role: 'status', 'aria-live': 'polite' });
    document.body.append(root);
  }
  return root;
}

/**
 * showToast('Saved') or showToast('Update ready', { actionLabel: 'Reload', onAction })
 * Toasts with an action stay until dismissed; plain ones fade after `duration` ms.
 */
export function showToast(message, { duration = 4000, actionLabel, onAction } = {}) {
  const node = el('div', { class: 'toast' }, el('span', { class: 'toast__text' }, message));
  const dismiss = () => node.remove();

  if (actionLabel && onAction) {
    node.append(el('button', {
      class: 'toast__action', type: 'button',
      onClick: () => { onAction(); dismiss(); },
    }, actionLabel));
  } else {
    setTimeout(dismiss, duration);
  }
  getRoot().append(node);
  return dismiss;
}
