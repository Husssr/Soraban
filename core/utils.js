// Small DOM + general helpers. Nothing here touches the DOM at import time,
// so the pure helpers can also be imported from Node tests.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Append children (strings, numbers, Nodes, arrays) to a node. */
function appendChildren(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(node, child);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

/** Apply an attribute map. `onClick`-style keys become event listeners. */
function applyAttrs(node, attrs) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.setAttribute('class', value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (/^on[A-Z]/.test(key) && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value' || key === 'checked' || key === 'selected' || key === 'disabled') {
      node[key] = value;
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
}

/** Create an HTML element: el('button', {class: 'btn', onClick}, 'Label'). */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

/** Create an SVG element in the SVG namespace. */
export function svgEl(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Number of decimal digits of a non-negative integer (0 -> 1). */
export function digitCount(n) {
  return String(Math.abs(Math.trunc(n))).length;
}

/** Local calendar date as YYYY-MM-DD (used as the Daily Challenge key). */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** mm:ss from milliseconds. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the OS or the in-app setting asks for less motion. */
export function isReducedMotion() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.classList.contains('reduce-motion')) return true;
  return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}
