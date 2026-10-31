// App state with a versioned schema + migrations. Phase 1 holds settings;
// later phases add students, history, etc. to the same document, so the
// migration chain is already in place.

import * as storage from './storage.js';
import { uid } from './utils.js';

export const SCHEMA_VERSION = 2;

export const NAME_MAX = 24;
export const MAX_STUDENTS = 50;
export const MAX_HISTORY = 300; // games kept per student (oldest dropped first)
// Avatar colours: all dark enough for white initials (contrast >= 4.5:1).
export const STUDENT_COLORS = ['#c2410c', '#0f766e', '#1d4ed8', '#7e22ce', '#be123c', '#4d7c0f', '#a16207', '#475569'];
const DATA_KEY = 'data';

export const DEFAULT_SETTINGS = Object.freeze({
  lang: 'th',
  theme: 'system', // system | light | dark
  sound: true,
  volume: 0.6,
  inputMethod: 'soroban', // soroban | numpad | mental
  showLabels: true,
  reduceMotion: false,
  defaultLevel: 1, // 1..10 or 'custom'
  flashSpeed: 1.0, // seconds per number
  showTimer: true,
  haptics: true,
});

/** Validation rules per setting; anything invalid falls back to the default. */
const RULES = {
  lang: { type: 'enum', values: ['th', 'en'] },
  theme: { type: 'enum', values: ['system', 'light', 'dark'] },
  sound: { type: 'bool' },
  volume: { type: 'number', min: 0, max: 1, step: 0.05 },
  inputMethod: { type: 'enum', values: ['soroban', 'numpad', 'mental'] },
  showLabels: { type: 'bool' },
  reduceMotion: { type: 'bool' },
  defaultLevel: { type: 'level' },
  flashSpeed: { type: 'number', min: 0.3, max: 3, step: 0.1 },
  showTimer: { type: 'bool' },
  haptics: { type: 'bool' },
};

/** Return a valid value for `key`, or the default if `value` is unusable. */
export function sanitizeSetting(key, value) {
  const rule = RULES[key];
  const fallback = DEFAULT_SETTINGS[key];
  if (!rule) return undefined;
  switch (rule.type) {
    case 'enum':
      return rule.values.includes(value) ? value : fallback;
    case 'bool':
      return typeof value === 'boolean' ? value : fallback;
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
      const clamped = Math.min(rule.max, Math.max(rule.min, value));
      const inv = 1 / rule.step;
      return Math.round(clamped * inv) / inv;
    }
    case 'level':
      if (value === 'custom') return value;
      return Number.isInteger(value) && value >= 1 && value <= 10 ? value : fallback;
    default:
      return fallback;
  }
}

export function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    out[key] = key in source ? sanitizeSetting(key, source[key]) : DEFAULT_SETTINGS[key];
  }
  return out;
}

export function createDefaultData() {
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    students: [], // filled in by the Students phase
    activeStudentId: null,
  };
}

// ---- students & history sanitising -------------------------------------------

const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

function sanitizeLevel(level) {
  if (level === 'custom') return 'custom';
  return Number.isInteger(level) && level >= 1 && level <= 10 ? level : null;
}

/** One finished game. Missing/garbage fields become safe numbers. */
export function sanitizeRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const questions = Math.max(0, Math.round(num(r.questions)));
  return {
    id: typeof r.id === 'string' ? r.id : uid('g'),
    at: num(r.at),
    mode: typeof r.mode === 'string' ? r.mode : 'practice',
    level: sanitizeLevel(r.level),
    type: typeof r.type === 'string' ? r.type : 'level',
    questions,
    correct: Math.min(questions, Math.max(0, Math.round(num(r.correct)))),
    score: Math.max(0, Math.round(num(r.score))),
    avgTimeMs: Math.max(0, num(r.avgTimeMs)),
    bestStreak: Math.max(0, Math.round(num(r.bestStreak))),
    durationMs: Math.max(0, num(r.durationMs)),
  };
}

export function sanitizeStudent(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const name = Array.from(cleanName(raw.name)).slice(0, NAME_MAX).join('');
  if (!name) return null;
  return {
    id: raw.id,
    name,
    color: STUDENT_COLORS.includes(raw.color) ? raw.color : STUDENT_COLORS[0],
    createdAt: num(raw.createdAt),
    level: sanitizeLevel(raw.level) === 'custom' ? null : sanitizeLevel(raw.level),
    history: (Array.isArray(raw.history) ? raw.history : [])
      .map(sanitizeRecord).filter(Boolean).slice(-MAX_HISTORY),
  };
}

function sanitizeStudents(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(sanitizeStudent)
    .filter((s) => s && !seen.has(s.id) && seen.add(s.id))
    .slice(0, MAX_STUDENTS);
}

/** One function per version step: MIGRATIONS[n] upgrades v(n) -> v(n+1). */
const MIGRATIONS = {
  // v0 (no version field / unknown shape) -> v1
  0: (data) => ({
    ...data,
    version: 1,
    settings: sanitizeSettings(data.settings ?? data),
    students: Array.isArray(data.students) ? data.students : [],
    activeStudentId: typeof data.activeStudentId === 'string' ? data.activeStudentId : null,
  }),
  // v1 -> v2: students get a validated shape (name, colour, level, history)
  1: (data) => ({ ...data, version: 2, students: sanitizeStudents(data.students) }),
};

/**
 * Bring any stored document up to the current schema. Never throws:
 * unusable input yields fresh defaults.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createDefaultData();
  let data = { ...raw };
  let version = Number.isInteger(data.version) && data.version >= 0 ? data.version : 0;
  // A document written by a newer app version is kept as-is (only settings are re-validated).
  if (version > SCHEMA_VERSION) {
    return { ...data, settings: sanitizeSettings(data.settings) };
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return createDefaultData();
    data = step(data);
    version = data.version;
  }
  data.settings = sanitizeSettings(data.settings);
  data.students = sanitizeStudents(data.students);
  if (!data.students.some((s) => s.id === data.activeStudentId)) data.activeStudentId = null;
  return data;
}

let data = migrate(storage.read(DATA_KEY, null));
const listeners = new Set();

function persist() {
  return storage.write(DATA_KEY, data);
}

function notify(changedKey) {
  for (const fn of listeners) fn(data.settings, changedKey);
}

export function getData() {
  return data;
}

export function getSettings() {
  return data.settings;
}

/** Validate, store and broadcast one setting. */
export function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) return false;
  const clean = sanitizeSetting(key, value);
  if (data.settings[key] === clean) return true;
  data = { ...data, settings: { ...data.settings, [key]: clean } };
  persist();
  notify(key);
  return true;
}

/** Subscribe to settings changes: fn(settings, changedKey). Returns unsubscribe. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- students --------------------------------------------------------------------
// activeStudentId === null means "guest": nothing is recorded for a guest.

function commit(next, key) {
  data = next;
  persist();
  notify(key);
}

export function getStudents() {
  return data.students;
}

export function getStudent(id) {
  return data.students.find((s) => s.id === id) ?? null;
}

export function getActiveStudent() {
  return getStudent(data.activeStudentId);
}

/** Initial shown in the avatar: first letter/digit (Thai vowel marks are skipped). */
export function studentInitial(name) {
  const chars = Array.from(cleanName(name));
  const pick = chars.find((c) => /[0-9A-Za-zก-ฮ]/.test(c)) ?? chars[0] ?? '?';
  return pick.toLocaleUpperCase();
}

/** { ok: true, name } or { ok: false, error: 'empty' | 'tooLong' | 'duplicate' }. */
export function validateStudentName(name, excludeId = null) {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: 'empty' };
  if (Array.from(clean).length > NAME_MAX) return { ok: false, error: 'tooLong' };
  const lower = clean.toLocaleLowerCase();
  if (data.students.some((s) => s.id !== excludeId && s.name.toLocaleLowerCase() === lower)) {
    return { ok: false, error: 'duplicate' };
  }
  return { ok: true, name: clean };
}

/** Create a student and make them the active player. */
export function addStudent(name) {
  if (data.students.length >= MAX_STUDENTS) return { ok: false, error: 'limit' };
  const check = validateStudentName(name);
  if (!check.ok) return check;
  const student = {
    id: uid('s'),
    name: check.name,
    color: STUDENT_COLORS[data.students.length % STUDENT_COLORS.length],
    createdAt: Date.now(),
    level: null,
    history: [],
  };
  commit({ ...data, students: [...data.students, student], activeStudentId: student.id }, 'students');
  return { ok: true, student };
}

export function renameStudent(id, name) {
  const existing = getStudent(id);
  if (!existing) return { ok: false, error: 'missing' };
  const check = validateStudentName(name, id);
  if (!check.ok) return check;
  const student = { ...existing, name: check.name };
  commit({ ...data, students: data.students.map((s) => (s.id === id ? student : s)) }, 'students');
  return { ok: true, student };
}

/** Removes the student and all their history. If active, falls back to guest. */
export function deleteStudent(id) {
  if (!getStudent(id)) return false;
  commit({
    ...data,
    students: data.students.filter((s) => s.id !== id),
    activeStudentId: data.activeStudentId === id ? null : data.activeStudentId,
  }, 'students');
  return true;
}

/** Switch player; null = guest. */
export function setActiveStudent(id) {
  const next = id === null || getStudent(id) ? id : null;
  if (next === data.activeStudentId) return;
  commit({ ...data, activeStudentId: next }, 'students');
}

/** The level a student last picked (1-10); null falls back to the default setting. */
export function setStudentLevel(id, level) {
  const existing = getStudent(id);
  const clean = sanitizeLevel(level);
  if (!existing || clean === 'custom') return false;
  if (existing.level === clean) return true;
  commit({ ...data, students: data.students.map((s) => (s.id === id ? { ...s, level: clean } : s)) }, 'students');
  return true;
}

/** Level to preselect for the active student (or guest). */
export function getPreferredLevel() {
  const s = getActiveStudent();
  if (s?.level) return s.level;
  const d = data.settings.defaultLevel;
  return Number.isInteger(d) ? d : 1;
}

/**
 * Save a finished game to the active student's history.
 * Returns the stored record, or null for a guest (nothing is saved).
 */
export function recordGame(record) {
  const student = getActiveStudent();
  if (!student) return null;
  const clean = sanitizeRecord({ ...record, id: uid('g'), at: record.at ?? Date.now() });
  if (!clean) return null;
  const history = [...student.history, clean].slice(-MAX_HISTORY);
  commit({ ...data, students: data.students.map((s) => (s.id === student.id ? { ...student, history } : s)) }, 'students');
  return clean;
}

/** Wipe everything and return to defaults. */
export function resetAll() {
  storage.clearAll();
  data = createDefaultData();
  persist();
  notify('*');
}

/** Test hook: reload state from the (possibly mocked) storage. */
export function _reloadForTests() {
  data = migrate(storage.read(DATA_KEY, null));
}
