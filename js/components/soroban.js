// Interactive soroban (SVG). Bead rules live in soroban-model.js; this file
// only draws them and turns pointer / keyboard input into model moves.
//
//   const s = new Soroban({ rods: 5 });
//   container.append(s.el);
//   s.onChange(({ value, source }) => ...);
//   s.setValue(1234); s.getValue(); s.reset();
//   s.setHighlight(2); s.setDisabled(true);
//
// Keyboard (focus the soroban first): Left/Right choose a rod, Up/Down add or
// remove 1 on that rod, 0-9 set the rod's digit (and move right), Space toggles
// the heaven bead, Backspace/Delete clears the rod, Home/End jump to first/last rod.

import { el, svgEl, clamp } from '../core/utils.js';
import { t } from '../i18n/index.js';
import { play, vibrate } from '../core/audio.js';
import * as M from './soroban-model.js';

// Geometry in SVG user units.
const ROD_W = 48; // column width
const PAD = 6; // frame side padding
const BEAD_W = 38;
const BEAD_H = 24;
const TRAVEL = 20; // how far a bead slides
const FRAME_TOP = 6;
const BEAM_TOP = 56;
const BEAM_H = 8;
const EARTH_TOP = BEAM_TOP + BEAM_H + 3; // first earth bead resting on the beam
const FRAME_BOTTOM = 186;
const BODY_H = 192; // svg height without labels
const LABEL_H = 30;
const MIN_ROD_PX = 44; // minimum on-screen column width (touch target)
const DRAG_THRESHOLD_PX = 8;

const heavenY = (h) => (h ? FRAME_TOP + 3 + TRAVEL : FRAME_TOP + 3);
const earthY = (i, e) => EARTH_TOP + i * BEAD_H + (i >= e ? TRAVEL : 0);

export class Soroban {
  /**
   * @param {object} opts
   * @param {number} [opts.rods=5]          1-13
   * @param {number} [opts.value=0]
   * @param {boolean} [opts.showLabels=true]  small digit under each rod
   * @param {boolean} [opts.showValue=true]   numeric readout under the soroban
   * @param {boolean} [opts.disabled=false]
   */
  constructor({ rods = 5, value = 0, showLabels = true, showValue = true, disabled = false } = {}) {
    this._listeners = new Set();
    this._showLabels = showLabels;
    this._showValue = showValue;
    this._disabled = disabled;
    this._focusRod = null;
    this._highlight = null;
    this._drag = null;
    this._build(rods, M.valueToRods(clamp(value, 0, M.maxValue(rods)), rods));
    this.setDisabled(disabled);
  }

  // ---- public API ---------------------------------------------------------

  getValue() {
    return M.rodsToValue(this._rods);
  }

  /** Digits of every rod, most significant first. */
  getDigits() {
    return M.rodsToDigits(this._rods);
  }

  getRodCount() {
    return this._rods.length;
  }

  /** Set the whole value. Throws RangeError if it does not fit on the rods. */
  setValue(value, { silent = false } = {}) {
    const next = M.valueToRods(value, this._rods.length);
    this._commit(next, { source: 'api', rodIndex: null, silent });
    return this;
  }

  /** Set a single rod to a digit 0-9 (rod 0 = leftmost). */
  setRodDigit(rodIndex, digit, { silent = false } = {}) {
    this._assertRod(rodIndex);
    const next = this._rods.slice();
    next[rodIndex] = M.digitToRod(digit);
    this._commit(next, { source: 'api', rodIndex, silent });
    return this;
  }

  reset() {
    return this.setValue(0);
  }

  /** Subscribe to value changes. cb({ value, digits, rodIndex, source }). Returns unsubscribe. */
  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  /** Draw attention to one rod (e.g. in lessons). Pass null to clear. */
  setHighlight(rodIndex) {
    if (rodIndex !== null && rodIndex !== undefined) this._assertRod(rodIndex);
    this._highlight = rodIndex ?? null;
    this._cols.forEach((col, i) => col.classList.toggle('is-highlight', i === this._highlight));
    return this;
  }

  setDisabled(disabled) {
    this._disabled = !!disabled;
    this.el.classList.toggle('is-disabled', this._disabled);
    this.el.setAttribute('aria-disabled', String(this._disabled));
    this._frame.setAttribute('tabindex', this._disabled ? '-1' : '0');
    return this;
  }

  setShowLabels(show) {
    this._showLabels = !!show;
    this._applyLabelVisibility();
    return this;
  }

  setShowValue(show) {
    this._showValue = !!show;
    this._readout.hidden = !this._showValue;
    return this;
  }

  /** Change the number of rods; keeps the value if it still fits, else clears. */
  setRodCount(count) {
    const n = clamp(Math.round(count), M.MIN_RODS, M.MAX_RODS);
    if (n === this._rods.length) return this;
    const current = this.getValue();
    const rods = current <= M.maxValue(n) ? M.valueToRods(current, n) : M.emptyRods(n);
    const host = this.el.parentNode;
    const previous = this.el;
    this._build(n, rods);
    this.setDisabled(this._disabled);
    if (host) host.replaceChild(this.el, previous);
    return this;
  }

  focus() {
    this._frame.focus({ preventScroll: true });
  }

  destroy() {
    this._listeners.clear();
    this.el.remove();
  }

  // ---- construction -------------------------------------------------------

  _assertRod(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this._rods.length) {
      throw new RangeError(`rod index ${i} out of range`);
    }
  }

  _build(rodCount, rods) {
    this._rods = rods;
    this._focusRod = rodCount - 1; // start on the ones rod
    const width = rodCount * ROD_W + PAD * 2;

    this.svg = svgEl('svg', {
      class: 'sb',
      viewBox: `0 0 ${width} ${BODY_H + LABEL_H}`,
      role: 'img',
      'aria-hidden': 'true', // the focusable wrapper carries the accessible name
      focusable: 'false',
    });
    this.svg.style.width = `min(100%, ${width}px)`;
    this.svg.style.minWidth = `${rodCount * MIN_ROD_PX + PAD * 2}px`;

    this._cols = [];
    this._labels = [];
    this._heaven = [];
    this._earth = [];

    // Column backgrounds (focus / highlight), then frame, rods, beam, beads, labels.
    const colLayer = svgEl('g');
    const rodLayer = svgEl('g');
    const beadLayer = svgEl('g');
    const labelLayer = svgEl('g', { class: 'sb-labels' });
    this._labelLayer = labelLayer;

    for (let k = 0; k < rodCount; k++) {
      const cx = PAD + ROD_W * (k + 0.5);
      const col = svgEl('rect', {
        class: 'sb-col',
        x: cx - ROD_W / 2 + 2, y: FRAME_TOP - 2, width: ROD_W - 4, height: FRAME_BOTTOM - FRAME_TOP + 4, rx: 6,
      });
      colLayer.append(col);
      this._cols.push(col);

      rodLayer.append(svgEl('line', { class: 'sb-rod', x1: cx, x2: cx, y1: FRAME_TOP, y2: FRAME_BOTTOM }));

      const heaven = this._makeBead(k, 'h', 0, cx);
      beadLayer.append(heaven);
      this._heaven.push(heaven);

      const earth = [];
      for (let i = 0; i < 4; i++) {
        const bead = this._makeBead(k, 'e', i, cx);
        beadLayer.append(bead);
        earth.push(bead);
      }
      this._earth.push(earth);

      const label = svgEl('text', { class: 'sb-label', x: cx, y: BODY_H + 20 });
      labelLayer.append(label);
      this._labels.push(label);
    }

    const frame = svgEl('rect', {
      class: 'sb-frame', x: PAD, y: FRAME_TOP, width: rodCount * ROD_W, height: FRAME_BOTTOM - FRAME_TOP, rx: 6,
    });
    const beam = svgEl('rect', { class: 'sb-beam', x: PAD, y: BEAM_TOP, width: rodCount * ROD_W, height: BEAM_H });
    const dots = svgEl('g', { class: 'sb-dots' });
    for (let k = 0; k < rodCount; k++) {
      // a dot on every third rod marks the unit positions, like a real soroban
      if ((rodCount - 1 - k) % 3 === 0) {
        dots.append(svgEl('circle', { cx: PAD + ROD_W * (k + 0.5), cy: BEAM_TOP + BEAM_H / 2, r: 1.8 }));
      }
    }

    this.svg.append(colLayer, rodLayer, frame, beam, dots, beadLayer, labelLayer);

    this._readout = el('div', { class: 'sb-readout', 'aria-hidden': 'true' });
    this._readout.hidden = !this._showValue;
    this._live = el('span', { class: 'sr-only', 'aria-live': 'polite' });

    // The focusable, named wrapper (keyboard target).
    this._frame = el('div', {
      class: 'sb-frame-wrap',
      tabindex: '0',
      role: 'group',
      'aria-roledescription': 'soroban',
      'aria-label': t('soroban.label', { rods: rodCount }),
    }, this.svg);
    this._frame.style.setProperty('--rods', String(rodCount));
    const scroll = el('div', { class: 'sb-scroll' }, this._frame);

    this.el = el('div', { class: 'soroban' }, scroll, this._readout, this._live);

    this.svg.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.svg.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.svg.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.svg.addEventListener('pointercancel', () => { this._drag = null; });
    this._frame.addEventListener('keydown', (e) => this._onKeyDown(e));
    this._frame.addEventListener('focus', () => this._updateFocusClass(true));
    this._frame.addEventListener('blur', () => this._updateFocusClass(false));

    this._applyLabelVisibility();
    this._renderAll();
  }

  _makeBead(rodIndex, kind, index, cx) {
    const g = svgEl('g', { class: `sb-bead sb-bead--${kind === 'h' ? 'heaven' : 'earth'}` });
    g.dataset.rod = String(rodIndex);
    g.dataset.kind = kind;
    g.dataset.index = String(index);
    g.dataset.x = String(cx - BEAD_W / 2);
    g.append(svgEl('rect', { width: BEAD_W, height: BEAD_H, rx: BEAD_H / 2 }));
    return g;
  }

  // ---- rendering ----------------------------------------------------------

  _place(bead, y) {
    bead.style.transform = `translate(${bead.dataset.x}px, ${y}px)`;
  }

  _renderRod(k) {
    const { h, e } = this._rods[k];
    this._place(this._heaven[k], heavenY(h));
    this._heaven[k].classList.toggle('is-active', h === 1);
    this._earth[k].forEach((bead, i) => {
      this._place(bead, earthY(i, e));
      bead.classList.toggle('is-active', i < e);
    });
    this._labels[k].textContent = String(M.rodToDigit(this._rods[k]));
  }

  _renderAll() {
    this._rods.forEach((_, k) => this._renderRod(k));
    this._readout.textContent = String(this.getValue());
    this._updateFocusClass(document.activeElement === this._frame);
    this.setHighlight(this._highlight !== null && this._highlight < this._rods.length ? this._highlight : null);
  }

  _applyLabelVisibility() {
    this._labelLayer.style.display = this._showLabels ? '' : 'none';
    const h = BODY_H + (this._showLabels ? LABEL_H : 0);
    this.svg.setAttribute('viewBox', `0 0 ${this._rods.length * ROD_W + PAD * 2} ${h}`);
  }

  _updateFocusClass(hasFocus) {
    this._cols.forEach((col, i) => col.classList.toggle('is-focus', hasFocus && i === this._focusRod));
  }

  // ---- state changes ------------------------------------------------------

  /** Apply a new rod array: render changed rods, make noise, notify. */
  _commit(nextRods, { source, rodIndex, silent = false }) {
    const before = this._rods;
    if (M.rodsEqual(before, nextRods)) return false;
    this._rods = nextRods;
    nextRods.forEach((rod, k) => {
      if (rod.h !== before[k].h || rod.e !== before[k].e) this._renderRod(k);
    });
    this._readout.textContent = String(this.getValue());
    if (source === 'user') {
      play('bead');
      vibrate(6);
      this._announce(rodIndex);
    }
    if (!silent) {
      const detail = { value: this.getValue(), digits: this.getDigits(), rodIndex, source };
      for (const cb of this._listeners) cb(detail);
    }
    return true;
  }

  _changeRod(rodIndex, newRod) {
    const next = this._rods.slice();
    next[rodIndex] = newRod;
    return this._commit(next, { source: 'user', rodIndex });
  }

  _announce(rodIndex) {
    const k = rodIndex ?? this._focusRod;
    this._live.textContent = t('soroban.rodStatus', {
      n: k + 1, digit: M.rodToDigit(this._rods[k]), value: this.getValue(),
    });
  }

  _setFocusRod(k) {
    this._focusRod = clamp(k, 0, this._rods.length - 1);
    this._updateFocusClass(true);
    this._announce(this._focusRod);
  }

  // ---- pointer input ------------------------------------------------------

  _onPointerDown(e) {
    if (this._disabled || (e.button !== undefined && e.button > 0)) return;
    const bead = e.target.closest?.('.sb-bead');
    if (!bead) return;
    const rod = Number(bead.dataset.rod);
    this._drag = {
      pointerId: e.pointerId, rod, kind: bead.dataset.kind, index: Number(bead.dataset.index),
      startY: e.clientY, lastDir: 0, moved: false,
    };
    try { bead.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer: ignore */ }
    this._focusRod = rod;
    this._frame.focus({ preventScroll: true });
    this._updateFocusClass(true);
  }

  _onPointerMove(e) {
    const d = this._drag;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    const dir = dy > 0 ? 1 : -1; // 1 = dragging down
    if (dir === d.lastDir) return;
    d.lastDir = dir;
    d.moved = true;
    d.startY = e.clientY; // so reversing needs only one more threshold
    // heaven bead moves toward the beam when dragged down; earth beads when dragged up
    const toward = d.kind === 'h' ? dir > 0 : dir < 0;
    this._moveBead(d, toward);
  }

  _onPointerUp(e) {
    const d = this._drag;
    if (!d || d.pointerId !== e.pointerId) return;
    this._drag = null;
    if (d.moved) return;
    // plain tap: flip the bead
    const rod = this._rods[d.rod];
    this._changeRod(d.rod, d.kind === 'h' ? M.tapHeaven(rod) : M.tapEarth(rod, d.index));
    this._announce(d.rod);
  }

  _moveBead(d, toward) {
    const rod = this._rods[d.rod];
    const next = d.kind === 'h' ? M.moveHeaven(rod, toward) : M.moveEarth(rod, d.index, toward);
    this._changeRod(d.rod, next);
  }

  // ---- keyboard input -----------------------------------------------------

  _onKeyDown(e) {
    if (this._disabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = this._focusRod;
    const rod = this._rods[k];
    let handled = true;

    switch (e.key) {
      case 'ArrowLeft': this._setFocusRod(k - 1); break;
      case 'ArrowRight': this._setFocusRod(k + 1); break;
      case 'Home': this._setFocusRod(0); break;
      case 'End': this._setFocusRod(this._rods.length - 1); break;
      case 'ArrowUp': this._changeRod(k, M.stepDigit(rod, +1)); break;
      case 'ArrowDown': this._changeRod(k, M.stepDigit(rod, -1)); break;
      case ' ':
      case 'Enter': this._changeRod(k, M.tapHeaven(rod)); break;
      case 'Backspace':
      case 'Delete': this._changeRod(k, M.digitToRod(0)); break;
      default:
        if (/^[0-9]$/.test(e.key)) {
          this._changeRod(k, M.digitToRod(Number(e.key)));
          if (k < this._rods.length - 1) this._setFocusRod(k + 1);
        } else {
          handled = false;
        }
    }
    if (handled) e.preventDefault();
  }
}
