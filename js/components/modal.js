// Accessible confirm dialog: focus trap, Esc to cancel, focus restored on close.

import { el, uid } from '../core/utils.js';
import { t } from '../i18n/index.js';

/**
 * Resolves true on confirm, false on cancel / Esc / backdrop click.
 * Initial focus goes to Cancel so a stray Enter never confirms a destructive action.
 */
export function confirmDialog({ title, message, confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const titleId = uid('modal-title');
    const bodyId = uid('modal-body');

    const cancelBtn = el('button', { class: 'btn', type: 'button' }, cancelLabel ?? t('common.cancel'));
    const okBtn = el('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button' }, confirmLabel);

    const dialog = el('div', {
      class: 'modal', role: 'alertdialog', 'aria-modal': 'true',
      'aria-labelledby': titleId, 'aria-describedby': bodyId,
    },
    el('h2', { id: titleId, class: 'modal__title' }, title),
    el('p', { id: bodyId, class: 'modal__body' }, message),
    el('div', { class: 'modal__actions' }, cancelBtn, okBtn));

    const backdrop = el('div', { class: 'modal-backdrop' }, dialog);

    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Tab') {
        // keep focus inside the dialog
        const items = [cancelBtn, okBtn];
        const index = items.indexOf(document.activeElement);
        e.preventDefault();
        const next = e.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
        items[next].focus();
      }
    }

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(false); });
    document.addEventListener('keydown', onKey, true);

    document.body.append(backdrop);
    cancelBtn.focus();
  });
}

/**
 * Text prompt (used to rename a student). Resolves with the entered string, or
 * null if cancelled. `validate(text)` returns an error message or '' when fine;
 * the dialog stays open and shows the message until the input is valid.
 */
export function promptDialog({ title, label, value = '', confirmLabel, cancelLabel, validate, maxLength = 40 }) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const titleId = uid('modal-title');
    const inputId = uid('modal-input');
    const errorId = uid('modal-error');

    const input = el('input', {
      id: inputId, class: 'input input--full', type: 'text', value, maxlength: maxLength,
      autocomplete: 'off', 'aria-describedby': errorId,
    });
    const error = el('p', { id: errorId, class: 'field__error', role: 'alert' });
    const cancelBtn = el('button', { class: 'btn', type: 'button' }, cancelLabel ?? t('common.cancel'));
    const okBtn = el('button', { class: 'btn btn--primary', type: 'button' }, confirmLabel);

    const dialog = el('div', {
      class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
    },
    el('h2', { id: titleId, class: 'modal__title' }, title),
    el('label', { class: 'field__label', for: inputId }, label),
    input, error,
    el('div', { class: 'modal__actions' }, cancelBtn, okBtn));

    const backdrop = el('div', { class: 'modal-backdrop' }, dialog);

    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    }

    function submit() {
      const message = validate ? validate(input.value) : '';
      if (message) {
        error.textContent = message;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      close(input.value);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      } else if (e.key === 'Enter' && document.activeElement === input) {
        e.preventDefault();
        submit();
      } else if (e.key === 'Tab') {
        const items = [input, cancelBtn, okBtn];
        const index = items.indexOf(document.activeElement);
        e.preventDefault();
        const next = e.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
        items[next].focus();
      }
    }

    cancelBtn.addEventListener('click', () => close(null));
    okBtn.addEventListener('click', submit);
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(null); });
    document.addEventListener('keydown', onKey, true);

    document.body.append(backdrop);
    input.focus();
    input.select();
  });
}
