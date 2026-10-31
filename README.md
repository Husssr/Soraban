# Soroban Mental Math · จินตคณิต

A static, offline-capable (PWA) soroban / mental-abacus practice app. Plain HTML + CSS + vanilla JS (ES modules), **no build step, no dependencies, no network calls**. Hosts for free on GitHub Pages.

## Status: phases 1–4 plus a basic Practice mode

| Phase | Status | What is there |
|---|---|---|
| 1 Foundation | done | hash router, TH/EN i18n, light/dark theme, safe storage + versioned schema, PWA shell, settings screen |
| 2 Soroban component | done | `Soroban` class (tap, drag, keyboard), pure bead model, unit tests |
| 3 Problem engine | done | seeded PRNG, 10 levels + custom, technique-aware generator, scoring, validator, Daily set |
| 4 Students | done | add / rename / delete / switch players, guest mode, **player + level picked on the start screen**, per-student level and game history (last 300 games each) |
| 5 Practice (basic) | done | untimed run of 10/20/30 questions, soroban or number-pad answers, flash numbers, results screen, saved to history. Still to come: hints, “Show me how”, step-by-step solutions |
| 5–9 remaining | next | Timed, Survival, Daily, Race, Duel, Flash mode, Lessons, Stats/charts/leaderboard/achievements, Export/Import, polish |

Open **Home → Play** to pick or add a player, choose a level and start. Open **Home → Lab** to play with the soroban and preview generated problems (including the Daily set for any date).

## Run locally

```bash
python3 -m http.server 8000      # or: npm run serve
# open http://localhost:8000
```

The service worker only registers on `https://` or `localhost`, so test PWA/offline behaviour through `localhost` (not by opening `index.html` as a `file://` URL).

## Tests

```bash
node tools/run-tests.mjs         # or: npm test   (58 tests, Node 18+)
```
Or open `tests.html` through the local server (same suite, runs in the browser).

Optional browser smoke test (needs Python + Playwright; not required to use the app):
```bash
python3 tools/e2e.py             # shell, settings, lab, offline
python3 tools/e2e-play.py        # add player -> play -> history saved; screenshots go to tools/shots/
```

What the suite covers: bead state ↔ value for every value on 5 rods and the limits of 1–13 rods, impossible bead positions, PRNG determinism, router, settings validation + migrations, TH/EN dictionary parity (keys and `{placeholders}`), technique classification, generator validity (thousands of problems per level and type: no negatives, no divide-by-zero, exact integer answers, no immediate repeats), Daily determinism over a full year, scoring and answer parsing.

## Deploy to GitHub Pages

### 1. Create the repo and push
```bash
cd soroban-game
git init -b main
git add .
git commit -m "Soroban game: phases 1-3"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### 2a. Enable Pages from a branch
Repo → **Settings → Pages → Build and deployment → Source: Deploy from a branch** → Branch `main`, folder `/ (root)` → Save.
The app appears at `https://<user>.github.io/<repo>/` after a minute.

### 2b. …or with GitHub Actions
Repo → **Settings → Pages → Source: GitHub Actions**. The workflow in `.github/workflows/pages.yml` runs the tests and then deploys with `actions/upload-pages-artifact` + `actions/deploy-pages` on every push to `main`. (Use either 2a or 2b, not both.)

All paths in the app are relative, so it works under the `/<repo>/` sub-path.

### 3. Releasing an update (service worker cache)
Users get files from the cache first, so a release must change the cache name:
1. In `sw.js` bump `CACHE_VERSION` (`'v1'` → `'v2'`).
2. If you added or removed files, update the `APP_SHELL` list in the same file.
3. Commit and push. Returning users see a “new version available — Reload” toast; the old cache is deleted when the new worker activates.

### 4. Test the PWA locally
`python3 -m http.server 8000`, open `http://localhost:8000`, DevTools → Application → Service Workers / Manifest. In DevTools → Network tick **Offline** and reload: the app still loads. Chrome/Edge show an install button once it is installable.

## Project layout

```
index.html  manifest.webmanifest  sw.js  tests.html
css/        theme.css (tokens, dark mode)  base.css  components.css  screens.css
js/main.js  entry: settings -> document, router, service worker
js/core/    storage (only localStorage access)  store (settings + migrations)
            router  prng  audio (Web Audio, no files)  utils
js/i18n/    th.js  en.js  index.js (t(), runtime switch, dictionary check)
js/engine/  levels  generator  techniques  scoring  validator  history
js/components/  soroban (SVG UI)  soroban-model (pure logic)  numpad  avatar  modal  toast
js/screens/ home  settings  lab  play-setup  game  students  shared  placeholder
js/tests/   suite.js (shared by tests.html and Node)
tools/      run-tests.mjs  e2e.py  make-icons.py
assets/icons/  generated SVG + PNG + maskable icons
```

### Using the Soroban component
```js
import { Soroban } from './js/components/soroban.js';
const s = new Soroban({ rods: 5 });          // 1-13 rods
container.append(s.el);
s.onChange(({ value, digits, rodIndex, source }) => { /* source: 'user' | 'api' */ });
s.setValue(1234); s.getValue(); s.reset();
s.setHighlight(2); s.setDisabled(true);
```
Keyboard: focus it, then ← → choose a rod, ↑ ↓ ±1, **0–9** set the rod's digit, Space toggles the heaven bead, Backspace clears the rod.

### Using the engine
```js
import { getLevelConfig, configForType } from './js/engine/levels.js';
import { generateSet, generateDaily } from './js/engine/generator.js';
import { checkAnswer } from './js/engine/validator.js';
import { scoreAnswer } from './js/engine/scoring.js';

const problems = generateSet(getLevelConfig(3), 10, 'optional-seed');
const daily = generateDaily('2026-10-31');   // identical on every device for that date
checkAnswer(problems[0], '12').correct;
```

## Assumptions

Choices made where the brief left room (all easy to change):

- **Technique rules.** For levels 1–3 every generated problem must need at least one move of the stated technique and none harder, checked by replaying the sum rod by rod including carries and borrows. 5 − 1 counts as the 5-complement (no earth bead to take away). Level 3 allows 3 operands so a 1-digit borrow is possible.
- **Level 6 and 7** are multiplication and division only (per the brief's progression); level 8 is add/subtract; 9 and 10 are flash.
- **Daily Challenge** = 10 questions, one from each level, seeded by the device's local date (`YYYY-MM-DD`). “Same for everyone” holds for people in the same calendar date; a different time zone can be on a different date.
- **Scoring**: 100 × level multiplier, plus up to +50 for speed, × combo (+0.1 per consecutive correct answer, capped at ×2). Timeouts and wrong answers score 0 and reset the streak.
- **“Recommended next” level** = the first level without ≥ 10 answered questions at ≥ 85 % accuracy.
- **Remainder division** accepts `7 r 2`, `7R2` or `7 เศษ 2`. Thai digits and the Unicode minus are accepted as typed input.
- **Soroban sizing**: columns are at least 44 px wide; wider sorobans scroll sideways on narrow phones instead of shrinking the touch targets. The Lab starts with 5 rods so it fits a 360 px screen.
- **Updates never swap files mid-game**: the new service worker waits and the user taps “Reload”.
- **Players**: the active player is remembered between visits; “Guest” records nothing. A student keeps their own last-picked level; language, theme, sound and answer method stay global (per-student overrides are not built). Names are unique (case-insensitive), max 24 characters, up to 50 students.
- **History** keeps the last 300 games per student (mode, level, type, score, accuracy, average time, best streak, duration). Quitting a game mid-way saves nothing. Deleting a student deletes their history.
- **Answer method “Mental”** currently behaves like the number pad (nothing is drawn), which is what the brief describes for flash anzan.
- **Soroban answers** show one spare rod beyond the answer's digit count so the width does not leak the answer.
- `package.json` exists only for `npm test` / `npm run serve`; nothing needs installing.

## Known limitations (this phase)

- Only Practice is playable. Timed, Survival, Daily, Race, Duel, Flash mode, lessons, statistics/charts, leaderboard, achievements and export/import are not built yet; Learn and Stats on the Home screen are disabled.
- The Custom level form is not built yet (the engine supports it), so the start screen offers levels 1–10 only.
- The in-app “reduce animation” switch and the OS preference both disable bead animation; there is no “slow” middle option.
- Haptics only work where the browser exposes the Vibration API (not iOS Safari).
- Lighthouse scores were not measured in this environment; the app has no render-blocking third-party resources and ships semantic, labelled controls, so it is built to meet the targets, but please run it once after deploying.

## Privacy

All data stays on the device (`localStorage`). No accounts, ads, analytics, CDNs or external requests.
