// The ONLY module that touches localStorage. Every access is wrapped in
// try/catch: storage can be disabled (private mode, blocked cookies), full
// (quota) or corrupted. When it fails we keep working from memory and tell
// listeners, so the app never crashes because of storage.

const PREFIX = 'soroban:';

let backend = detectBackend();
const memory = new Map();
const errorListeners = new Set();
let failed = backend === null;

function detectBackend() {
  try {
    const ls = globalThis.localStorage; // may itself throw (sandboxed iframes)
    if (!ls) return null;
    const probe = `${PREFIX}__probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

function reportError(error) {
  failed = true;
  for (const fn of errorListeners) {
    try { fn(error); } catch { /* listener errors must not break storage */ }
  }
}

/** True while data is really being written to localStorage. */
export function isPersistent() {
  return backend !== null && !failed;
}

/** Be told when a write fails (quota exceeded / storage disabled). */
export function onError(fn) {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

/** Read and JSON-parse a value. Returns `fallback` if missing or unreadable. */
export function read(key, fallback = null) {
  if (backend) {
    try {
      const raw = backend.getItem(PREFIX + key);
      if (raw !== null) return JSON.parse(raw);
      return memory.has(key) ? JSON.parse(memory.get(key)) : fallback;
    } catch {
      // corrupted JSON or blocked access -> use memory copy if we have one
    }
  }
  if (memory.has(key)) {
    try { return JSON.parse(memory.get(key)); } catch { /* fall through */ }
  }
  return fallback;
}

/** JSON-stringify and store a value. Returns true if it reached localStorage. */
export function write(key, value) {
  let json;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    reportError(error);
    return false;
  }
  memory.set(key, json); // always keep a session copy
  if (!backend) return false;
  try {
    backend.setItem(PREFIX + key, json);
    failed = false;
    return true;
  } catch (error) {
    reportError(error); // QuotaExceededError, SecurityError, ...
    return false;
  }
}

export function remove(key) {
  memory.delete(key);
  if (!backend) return;
  try { backend.removeItem(PREFIX + key); } catch (error) { reportError(error); }
}

/** Remove every key written by this app. */
export function clearAll() {
  memory.clear();
  if (!backend) return;
  try {
    const keys = [];
    for (let i = 0; i < backend.length; i++) {
      const k = backend.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => backend.removeItem(k));
  } catch (error) {
    reportError(error);
  }
}

/** Test hook: swap the backend (pass null to simulate disabled storage). */
export function _setBackendForTests(newBackend) {
  backend = newBackend;
  failed = newBackend === null;
  memory.clear();
}
