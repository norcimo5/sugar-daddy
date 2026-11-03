# Sugar Daddy — Test Plan

Tests are a deliverable (PROMPT.md §9). This plan lists what is tested automatically, how, and
what must still be checked by hand on real devices.

## How to run

| Layer                  | Command                                   | Notes                                              |
| ---------------------- | ----------------------------------------- | -------------------------------------------------- |
| Unit + integration     | `npm test`                                | Vitest + jsdom, `TZ=America/New_York` (DST-aware). |
| End-to-end             | `npm run build && npm run e2e`            | Playwright against `vite preview` on port 4173.    |
| PWA build verification | `npm run build` (or `npm run verify-pwa`) | `scripts/verify-pwa.mjs` checks `dist/`.           |
| Everything             | `npm run check`                           | format → lint → typecheck → test → build → e2e.    |

First-time e2e setup: `npx playwright install chromium webkit`.

Unit tests run in a fixed zone (`America/New_York`) so that day boundaries, week ranges and
daylight-saving transitions are exercised deterministically; `time.test.ts` asserts the zone.

## 1. Unit tests

At time of writing: **20 test files, 477 tests, all passing**
(`TZ=America/New_York npx vitest run`, Vitest 5.1.0, Node 26.3.0).

| File                                   | Tests | Covers                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/validation.test.ts`        |    32 | `parseNumber` (accepted formats, comma decimal); `validateFields`: required, inclusive min/max, out-of-range reported without clamping, decimal-place limits (trailing zeros count), BP per-field errors, pulse in bpm, diastolic ≥ systolic rejected, unknown keys ignored.                                                                                            |
| `src/domain/measurement.test.ts`       |    13 | `buildMeasurement`: exact value + raw text kept (no rounding, typed comma preserved), empty optional fields omitted, note trimmed, invalid / >5 min future `takenAt` rejected, unit/metric mismatch rejected, UTC normalisation; `reviseMeasurement` keeps id/createdAt/source.                                                                                         |
| `src/domain/metrics.test.ts`           |    19 | Built-in definitions (glucose, BP, weight, ketones: units, limits, defaults, only glucose enabled by default), registry ordering / lookup / duplicate ids, `defaultMetricConfig`, `formatMeasurementValue` (BP "120/80 · 72 bpm", display-unit conversion), and a **test-only fixture metric** proving extensibility.                                                   |
| `src/domain/units.test.ts`             |    10 | mg/dL ⇄ mmol/L (factor 18.0156) and kg ⇄ lb conversion, round trips, incompatible units throw, display decimals, no negative zero.                                                                                                                                                                                                                                      |
| `src/domain/thresholds.test.ts`        |    34 | `validateThresholds` ordering rules; `evaluateStatus`: unconfigured when no thresholds, partial thresholds, unit conversion before comparison, most-severe status across BP fields, pulse ignored; status labels; `statusIsConcerning`; `convertThresholds`.                                                                                                            |
| `src/domain/time.test.ts`              |    55 | Local date keys near midnight, start of day and `addLocalDays` across spring-forward/fall-back, day/week (Monday start)/month ranges incl. 23 h / 25 h days, anchor shifting, en-US formatting, range labels, `datetime-local` input round trip, zone-aware formatting.                                                                                                 |
| `src/domain/reminders.test.ts`         |    52 | `parseHHMM`, dismissal ids, slot construction (grace period, disabled and malformed reminders), status transitions upcoming → due → missed at exact edges, satisfaction window (`dueAt − 120 min` to grace end, 1 ms edges, other metric doesn't count), dismissals precedence, `next` slot.                                                                            |
| `src/domain/csv.test.ts`               |    39 | RFC 4180 escaping (commas, quotes, CR/LF, edge spaces), formula-injection guard, exact header list, BOM + CRLF, one row per present field, exact stored number, local time in the record's own zone (incl. DST, midnight as 00:00, invalid-zone fallback), sorting, filename.                                                                                           |
| `src/domain/backup.test.ts`            |    85 | `buildBackup` / filename; `parseBackup` accepts valid files and rejects: >20 MB, invalid JSON, wrong format, newer or invalid version, bad dates, unknown metric, wrong/unsupported unit, unknown fields, missing required values, duplicate ids, bad thresholds; `planRestore` merge vs replace counts and results.                                                    |
| `src/domain/copy.test.ts`              |    47 | Exact disclaimer, care-team note and tagline; saved messages per tone × status; concerning statuses never get playful copy (exhaustive); empty/welcome strings; tone guard against shaming or sexualised wording.                                                                                                                                                       |
| `src/db/idb.test.ts`                   |     9 | Schema v0 → v1 (stores, keyPaths, indexes), reopening keeps data, test-only v1 → v2 migration preserves data and runs once, migrations run in order, `versionchange` closes, blocked open → friendly `StorageError`.                                                                                                                                                    |
| `src/db/repo.test.ts`                  |    26 | Measurement CRUD and ordering, metric / date-range filters (from inclusive, to exclusive), settings defaults and merge, metric-config defaults, reminders and dismissals, `snapshot` / `applySnapshot` merge and replace, failed restore is atomic, write failures (invalid record, `QuotaExceededError` message), writes resolve only after the transaction completes. |
| `src/app/clock.test.ts`                |     3 | Injectable clock: real time by default, fixed start that advances, invalid start ignored.                                                                                                                                                                                                                                                                               |
| `src/app/notify.test.ts`               |     5 | Each due slot notified once per day, permission/support detection, notification text never contains a reading value.                                                                                                                                                                                                                                                    |
| `src/app/submitGuard.test.ts`          |     2 | Double-submit guard: one run while in flight; a new run allowed after failure.                                                                                                                                                                                                                                                                                          |
| `src/app/sw-register.test.ts`          |     7 | No registration in dev or without support; registers `/sw.js` at scope `/`; waiting worker reported and apply posts `SKIP_WAITING` then reloads once; first install not reported as update; registration failure doesn't throw.                                                                                                                                         |
| `src/ui/router.test.ts`                |    11 | Hash route parsing (Today, log, edit, history, trends, settings, about, fallbacks).                                                                                                                                                                                                                                                                                     |
| `src/ui/components/chartModel.test.ts` |     7 | Chart geometry: empty series, single point without a line, same-instant readings kept, target band only when configured, y direction, out-of-window points dropped, ticks inside domain.                                                                                                                                                                                |
| `scripts/verify-pwa.test.mjs`          |    13 | PNG size reading, precache list extraction, and `verifyDist` passing a good build and failing each defect (icon size, manifest field, invalid JSON, apple-touch icon, empty or incomplete precache, missing files, missing `<link>`s).                                                                                                                                  |
| `vite-plugin-precache.test.ts`         |     8 | Precache list building (leading slash, dedupe, sort, excludes `sw.js` / `_headers` / source maps, Windows paths) and placeholder injection (throws if missing, JSON-escaped).                                                                                                                                                                                           |

Coverage against PROMPT §9 "Unit tests": measurement and metric validation, unit conversion,
thresholds and the unconfigured state, date/time and zone boundaries, reminder due/missed,
duplicate-submit prevention, CSV escaping, backup validation and merge/replace, and schema
migrations are all covered by the files above.

## 2. Integration tests

Location: `src/ui/*.test.tsx` (and screen-level tests under `src/ui/`), using
`@testing-library/preact`, `@testing-library/user-event` and `fake-indexeddb`, rendering the real
UI against a real repository on an in-memory IndexedDB with a fixed clock.

These are being written alongside the UI screens. The intended coverage (implementation plan,
Task 7; PROMPT §9 "Integration tests") is:

- App start with an empty database (empty states, no sample data).
- Create, edit and delete a glucose reading (delete asks for confirmation).
- Today and History reflect what is stored in IndexedDB.
- Metric filter on History / Trends.
- Reminder configuration and the missed-reading banner on a fixed clock, including
  "Not needed".
- Export and restore round trip (backup → restore preview → merge / replace).
- Storage failure: a failed write shows "Not saved" and keeps the form contents.

Saving and retrieving offline is covered by the e2e offline reload (section 3); the integration
layer has no network to begin with.

## 3. End-to-end tests

Location: `e2e/*.spec.ts`, run by Playwright (`playwright.config.ts`) against the production
build served by `npm run preview` on <http://localhost:4173>. At time of writing the specs are
being written (implementation plan, Task 8); this section describes the intended coverage.

Projects:

- `android-chromium`: Playwright `Pixel 7` device (Chromium, mobile viewport, touch).
- `iphone-webkit`: Playwright `iPhone 14` device (WebKit, mobile viewport, touch). WebKit
  emulation is **not** iOS Safari.

The clock is fixed by setting `window.__SD_NOW__` with `page.addInitScript` before the app
loads, so reminder states are deterministic.

Main patient workflow (PROMPT §9, steps 1–8):

1. Launch the app.
2. Log a glucose reading without a note.
3. Verify it appears on Today and History.
4. Edit the reading.
5. Export the data (CSV and/or JSON download is produced).
6. Configure a reminder.
7. Verify the missed-reading indicator using the fixed clock.
8. Go offline (`context.setOffline(true)`), reload, and verify the app and the saved reading are
   still there.

## 4. PWA verification

Automatic, on every `npm run build` via `scripts/verify-pwa.mjs` (exits non-zero on any failure):

- `dist/manifest.webmanifest` parses and has `name`, `short_name`, `description`, `start_url`,
  `scope`, `id`, `display`, `theme_color`, `background_color` and a non-empty `icons` list.
- At least one icon has purpose `maskable`.
- Every manifest icon exists and its PNG dimensions match its declared `sizes`.
- `/icons/apple-touch-icon-180.png` exists and is 180×180.
- `dist/sw.js` has a non-empty injected precache list that includes `/index.html`, and every
  precached file exists in `dist/`.
- `dist/index.html` links the manifest and the apple-touch icon.

In the browser, via Playwright: the service worker installs on first online load, and after
going offline a reload still shows the app shell and saved data (e2e step 8).

Not checked automatically: that a browser actually offers to install the app, standalone
display after installation, and real notification delivery. These are in the manual checklist.

## 5. Manual device checklist

> **MANUAL — NOT YET PERFORMED on physical devices.** Everything below needs a real phone and a
> deployed HTTPS address.

- [ ] **Android, Chrome:** open the HTTPS address, menu ⋮ → Install app; icon appears; app opens
      standalone; works in airplane mode after first load.
- [ ] **iPhone, Safari:** Share → Add to Home Screen → Add; icon is correct; app opens
      standalone; works in airplane mode after first load.
- [ ] **Update flow:** deploy a new build; the "Update available" banner with Reload appears; Reload switches
      version; data is kept.
- [ ] **Screen readers:** full pass with VoiceOver (iOS) and TalkBack (Android): log, edit,
      delete, reminders, export, restore. Status is announced as text, the save toast is
      announced.
- [ ] **200% text zoom** (and the app's Extra large text size): no clipped or overlapping text,
      no horizontal scrolling on the main screens.
- [ ] **Dark mode:** all screens readable, chart and status badges legible.
- [ ] **Reduced motion:** with the OS setting on, no non-essential animation.
- [ ] **Notifications:** enable, send a test notification, observe behaviour with the app open,
      backgrounded and closed on each platform (see `docs/known-limitations.md`).
- [ ] **Export files:** open the CSV in a spreadsheet app; restore the JSON on a second device.

## 6. Results

See the final implementation report in the README's 'Verification status' section for the
latest recorded results.
