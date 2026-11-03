# Sugar Daddy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Phase 1 tasks (2–6) touch disjoint files and run in parallel subagents. Every task is TDD:
> failing test → run (see it fail) → minimal implementation → run (pass) → commit.

**Goal:** A tested, installable, offline-first PWA for logging glucose (plus blood pressure,
weight, ketones) for a hospitalised, non-technical patient.

**Architecture:** Pure deterministic domain (`src/domain`) + IndexedDB repository (`src/db`) +
Preact UI (`src/ui`) wired by a single `useAppData` hook (`src/app`). Hand-written service
worker with build-time precache list. See `docs/architecture.md`.

**Tech Stack:** TypeScript strict, Preact 10, Vite, Vitest + jsdom + fake-indexeddb +
@testing-library/preact, Playwright, ESLint, Prettier.

## Global Constraints

- Runtime dependency: `preact` only. No network calls to other origins. No analytics.
- Never `console.log` measurement values or notes.
- No clamping/rounding of entered values; store parsed number **and** raw string.
- UI must not branch on metric ids; use `MetricDefinition`.
- No medical advice text. Status labels exactly: "In target range", "Below target range",
  "Above target range", "Below low alert", "Above high alert", "No target range configured".
- Disclaimer text exactly: "Sugar Daddy records and displays measurements. It does not provide
  medical advice. Follow your care team's instructions."
- Tagline exactly: "Your glucose. Your rules."
- Touch targets ≥ 44×44 CSS px. Never colour-only status.
- Unit tests run with `TZ=America/New_York` (DST-aware) via the `test` npm script.
- Imports inside `src/domain` must not reference `src/db`, `src/app`, `src/ui`.

---

## Shared contract: `src/domain/types.ts` (written in Task 1, consumed by all)

```ts
export type MetricId = string; // built-ins: 'glucose' | 'blood_pressure' | 'weight' | 'ketones'
export type Unit = 'mg/dL' | 'mmol/L' | 'mmHg' | 'kg' | 'lb';
export interface FieldLimits {
  min: number;
  max: number;
  maxDecimals: number;
}
export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  unitLabel?: string; // fixed unit label overriding the metric unit (e.g. 'bpm')
  limits(unit: Unit): FieldLimits;
}
export interface MetricDefinition {
  id: MetricId;
  name: string;
  shortName: string;
  logLabel: string;
  units: readonly Unit[];
  defaultUnit: Unit;
  fields: readonly FieldDef[];
  primaryField: string;
  thresholdFields: readonly string[];
  defaultEnabled: boolean;
  order: number;
}
export interface Thresholds {
  targetLow?: number;
  targetHigh?: number;
  alertLow?: number;
  alertHigh?: number;
}
export interface MetricConfig {
  metricId: MetricId;
  enabled: boolean;
  unit: Unit;
  thresholds: Record<string, Thresholds>; // keyed by field key, values in `unit`
  createdAt: string;
  updatedAt: string;
}
export interface Measurement {
  id: string;
  metricId: MetricId;
  value: Record<string, number>;
  raw: Record<string, string>;
  unit: Unit;
  takenAt: string;
  timeZone: string;
  note?: string;
  source: 'manual' | 'import';
  createdAt: string;
  updatedAt: string;
}
export interface MeasurementInput {
  metricId: MetricId;
  raw: Record<string, string>;
  unit: Unit;
  takenAt: string;
  timeZone: string;
  note?: string;
}
export interface Reminder {
  id: string;
  time: string;
  metricId: MetricId;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Dismissal {
  id: string;
  reminderId: string;
  date: string;
  createdAt: string;
}
export type Tone = 'playful' | 'neutral';
export type TextSize = 'standard' | 'large' | 'xlarge';
export interface Settings {
  tone: Tone;
  textSize: TextSize;
  graceMinutes: number;
  notificationsEnabled: boolean;
  lastBackupAt?: string;
  firstRunDone: boolean;
}
export const DEFAULT_SETTINGS: Settings;
export type StatusKind =
  'unconfigured' | 'in_range' | 'below_target' | 'above_target' | 'below_alert' | 'above_alert';
export interface AppSnapshot {
  settings: Settings;
  metricConfigs: MetricConfig[];
  reminders: Reminder[];
  dismissals: Dismissal[];
  measurements: Measurement[];
}
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
```

---

### Task 1: Scaffold + types (lead, sequential)

Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`,
`vitest.setup.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/domain/types.ts`.
Verify: `npm run typecheck && npm run lint && npm test` (zero tests passes with `--passWithNoTests`).
Commit `chore: scaffold Sugar Daddy PWA`.

### Task 2: Metrics, validation, units, thresholds (subagent A)

Files: `src/domain/{metrics,validation,units,thresholds,measurement}.ts` + `*.test.ts`.
Produces:

- `units.ts`: `GLUCOSE_MGDL_PER_MMOLL = 18.0156`, `LB_PER_KG = 2.20462262185`,
  `convertValue(v: number, from: Unit, to: Unit): number` (identity when equal, throws on
  incompatible), `displayDecimals(unit: Unit): number` (mg/dL 0, mmol/L 1, mmHg 0, kg 1, lb 1),
  `formatNumber(v: number, decimals: number): string`.
- `metrics.ts`: `GLUCOSE, BLOOD_PRESSURE, WEIGHT, KETONES: MetricDefinition`,
  `BUILTIN_METRICS`, `createMetricRegistry(defs): MetricRegistry` with
  `{ all(): readonly MetricDefinition[]; get(id): MetricDefinition | undefined; require(id): MetricDefinition }`,
  `metricRegistry` (built-ins), `defaultMetricConfig(def, nowIso): MetricConfig`,
  `formatMeasurementValue(def, m: Pick<Measurement,'value'|'unit'>, displayUnit?: Unit): string`
  (BP → `"120/80"` and pulse appended `" · 72 bpm"`; others converted to displayUnit and
  formatted with `displayDecimals`), `unitLabel(def, unit): string`.
  Ranges: glucose mg/dL 10–1000 (0 dp), mmol/L 0.5–55 (1 dp… max 2); BP systolic 40–300,
  diastolic 20–200 (0 dp), pulse 20–250 optional (0 dp); weight kg 1–500, lb 2–1100 (max 2 dp);
  ketones mmol/L 0–15 (max 2 dp). Only glucose `defaultEnabled: true`.
- `validation.ts`: `parseNumber(raw: string): number | null` (accepts `^\d+([.,]\d+)?$` after
  trim; comma → dot), `validateFields(def, raw, unit): Result<Record<string,number>, Record<string,string>>`
  (errors keyed by field: "Enter a number.", "Enter a number between {min} and {max} {unit}.",
  "Use at most {n} decimal places."; optional empty fields omitted; BP also errors if diastolic ≥ systolic:
  "Diastolic must be lower than systolic.").
- `measurement.ts`: `buildMeasurement(def, input: MeasurementInput, now: Date, newId: () => string): Result<Measurement, Record<string,string>>`,
  `reviseMeasurement(existing, def, input, now): Result<Measurement, Record<string,string>>`
  (keeps id/createdAt/source, new updatedAt). Note trimmed; empty → undefined. Validates
  `takenAt` is a valid date not more than 5 minutes in the future (error key `takenAt`).
- `thresholds.ts`: `validateThresholds(t: Thresholds): string | null` (requires
  alertLow ≤ targetLow < targetHigh ≤ alertHigh for whichever are present),
  `evaluateStatus(def, config, m: Measurement): StatusKind` (convert m to config.unit; check
  each `thresholdFields`; severity alert > target > in_range; no thresholds at all →
  'unconfigured'; `<` alertLow → below_alert, `>` alertHigh → above_alert, `<` targetLow →
  below_target, `>` targetHigh → above_target; boundaries inclusive in range),
  `statusLabel(kind): string`, `statusIsConcerning(kind): boolean`,
  `convertThresholds(t, from, to): Thresholds`.

### Task 3: Time + reminders (subagent B)

Files: `src/domain/{time,reminders}.ts` + tests.
Produces:

- `time.ts`: `localDateKey(d: Date): string` (YYYY-MM-DD, device local),
  `startOfLocalDay(d: Date): Date`, `addLocalDays(d: Date, n: number): Date` (DST-safe),
  `type RangeKind = 'day'|'week'|'month'`, `rangeFor(kind, anchor: Date): {start: Date; end: Date}`
  (end exclusive; week Monday-start), `shiftAnchor(kind, anchor, dir: -1|1): Date`,
  `formatRangeLabel(kind, range): string`, `formatDateLong(d)`, `formatTime(d)`,
  `formatDateTime(d)`, `toLocalInputValue(d): string` ("YYYY-MM-DDTHH:mm"),
  `fromLocalInputValue(s): Date | null`, `currentTimeZone(): string`,
  `formatInZone(iso: string, timeZone: string): string` ("YYYY-MM-DD HH:mm", falls back to
  device zone if invalid).
- `reminders.ts`: `parseHHMM(s): {h:number;m:number} | null`,
  `type SlotStatus = 'upcoming'|'due'|'satisfied'|'missed'|'dismissed'`,
  `interface SlotState { reminder: Reminder; date: string; dueAt: Date; graceEndsAt: Date; status: SlotStatus; satisfiedBy?: string }`,
  `SATISFY_LOOKBACK_MINUTES = 120`,
  `evaluateReminders(args: { now: Date; reminders: Reminder[]; measurements: Measurement[]; dismissals: Dismissal[]; graceMinutes: number }): { today: SlotState[]; missed: SlotState[]; due: SlotState[]; next: SlotState | null }`
  (today sorted by dueAt; satisfied when a measurement of that metric has takenAt in
  `[dueAt − 120 min, graceEndsAt]`; `next` = first enabled upcoming slot today else first
  enabled tomorrow; disabled reminders excluded; dismissal id `${reminderId}@${date}`),
  `dismissalId(reminderId, date): string`.

### Task 4: CSV, backup, copy (subagent C)

Files: `src/domain/{csv,backup,copy}.ts` + tests.
Produces:

- `csv.ts`: `escapeCsvField(v: string): string` (quote if contains `, " \r \n` or leading/trailing
  space; double quotes), `guardFormula(v: string): string` (prefix `'` if starts with `= + - @ \t \r`),
  `CSV_HEADERS`, `measurementsToCsv(ms: Measurement[], registry: MetricRegistry): string`
  (BOM + CRLF; one row per measurement field: `id,metric,field,value,unit,entered_as,taken_at_local,time_zone,taken_at_utc,note,source,created_at,updated_at`;
  sorted by takenAt asc; value = exact stored number via `String(n)`; note guarded),
  `csvFilename(scope: string, now: Date): string` → `sugar-daddy-${scope}-YYYY-MM-DD.csv`.
- `backup.ts`: `BACKUP_FORMAT = 'sugar-daddy-backup'`, `BACKUP_VERSION = 1`,
  `interface BackupFile { format; version; exportedAt; app: {name; version}; data: AppSnapshot }`,
  `buildBackup(s: AppSnapshot, now: Date, appVersion: string): BackupFile`,
  `backupFilename(now)`, `parseBackup(text: string, registry): Result<BackupFile>` (strict
  validation of every record; unknown metric ids rejected; useful messages naming the record
  index), `type RestoreMode = 'merge'|'replace'`,
  `interface RestorePlan { mode; snapshot: AppSnapshot; counts: { measurementsNew; measurementsDuplicate; remindersNew; remindersDuplicate; total } }`,
  `planRestore(existing: AppSnapshot, backup: BackupFile, mode): RestorePlan`
  (merge: union by id keeping existing on duplicate, settings/configs keep existing values
  except configs missing locally; replace: backup snapshot verbatim).
- `copy.ts`: `savedMessage(tone, status: StatusKind): string`
  (concerning or neutral → "Reading saved."; playful + in_range → "Reading saved. Daddy says
  you're looking good."; playful + unconfigured → "Reading saved. Sweet and simple."),
  `emptyTodayMessage(tone)`, `emptyHistoryMessage(tone)`, `welcomeMessage(tone)`,
  `DISCLAIMER`, `CARE_TEAM_NOTE`, `TAGLINE`.

### Task 5: IndexedDB + repository (subagent D)

Files: `src/db/{idb,repo}.ts` + tests (fake-indexeddb).
Produces: `DB_NAME = 'sugar-daddy'`, `CURRENT_VERSION = 1`,
`type Migration = (db: IDBDatabase, tx: IDBTransaction) => void`, `MIGRATIONS: Migration[]`,
`openDatabase(opts?: { name?: string; migrations?: Migration[]; idb?: IDBFactory }): Promise<IDBDatabase>`,
`class StorageError extends Error { cause?: unknown }` with friendly message
(quota → "Your device is out of storage space. The reading was not saved."),
`createRepo(db: IDBDatabase, registry: MetricRegistry): Repo` where
`Repo = { listMeasurements(q?: {metricId?: string; from?: Date; to?: Date}): Promise<Measurement[]> (desc by takenAt);
putMeasurement(m): Promise<void>; deleteMeasurement(id): Promise<void>;
getSettings(): Promise<Settings>; saveSettings(s): Promise<void>;
listMetricConfigs(): Promise<MetricConfig[]> (defaults for missing built-ins, sorted by def.order);
saveMetricConfig(c): Promise<void>; listReminders(): Promise<Reminder[]>; putReminder(r); deleteReminder(id) (also deletes its dismissals);
listDismissals(): Promise<Dismissal[]>; putDismissal(d); snapshot(): Promise<AppSnapshot>;
applySnapshot(s: AppSnapshot, mode: 'merge'|'replace'): Promise<void> (single readwrite tx; replace clears all stores first) }`.
Every write resolves only on `tx.oncomplete`. Tests: CRUD, ordering, range query,
defaults, migration from empty, test-only v2 migration fixture preserves data, abort →
StorageError, replace vs merge atomicity.

### Task 6: PWA shell (subagent E)

Files: `public/manifest.webmanifest`, `public/icons/*` (generated from `assets/icon.svg` via
`scripts/make-icons.sh` using ImageMagick: 192, 512, maskable-512, apple-touch-180, favicon-32),
`public/sw.js`, `vite-plugin-precache.ts` (writes `__PRECACHE__` and `__BUILD_ID__` into
`dist/sw.js` after bundle), `public/_headers`, `src/app/sw-register.ts`
(`registerServiceWorker(onUpdate: (apply: () => void) => void)`), `scripts/verify-pwa.mjs`
(checks manifest fields, icon dimensions via PNG header, sw precache list non-empty).

### Task 7: App state + UI (lead, after 2–6)

Files: `src/app/{state,clock,notify,download,submitGuard}.ts`, `src/ui/**`, `src/styles.css`.
`createSubmitGuard()` unit-tested; integration tests with @testing-library/preact +
fake-indexeddb: empty start, create/edit/delete reading, Today/History reflect DB, metric
filter, reminder config + missed banner (fixed clock), restore round trip, storage failure
shows "Not saved".

### Task 8: E2E + PWA verification (subagent F, after 7)

`e2e/*.spec.ts` on Pixel 7 + iPhone 14 viewports (Chromium; WebKit if installable): main patient
workflow (PROMPT §9 steps 1–8) with a fixed clock injected via `window.__SD_NOW__` set by
`page.addInitScript`; offline reload against `vite preview`.

### Task 9: Docs (subagent G, parallel with 8)

`README.md`, `docs/test-plan.md`, `docs/known-limitations.md`.

### Task 10: Review + verification (lead)

superpowers:requesting-code-review subagent on the full diff; fix critical/high; then
superpowers:verification-before-completion: format, lint, typecheck, unit, e2e, build,
`verify-pwa`.

## Self-review

Spec coverage: T1–T9 → Task 7; L1–L10 → Tasks 2,7; M1–M5 → Task 2 (+fixture test); H1–H6 →
Tasks 3,7; R1–R7 → Tasks 3,7; E1–E7 → Tasks 4,5,7; S1–S8 → Task 7; X1–X4 → Tasks 4,7;
non-functional → Tasks 5,6,8,10. Signatures above are the single source of truth.

---

# Phase 2: Storyboard features + HUD restyle (requirements §7)

Same TDD and Global Constraints. Phase 2 tasks touch disjoint files and run in parallel.

### Shared contract additions (`src/domain/types.ts`, owned by Task 11)

```ts
export interface ContextOption {
  key: string;
  label: string;
}
// MetricDefinition: contexts?: readonly ContextOption[]
// Measurement / MeasurementInput: context?: string   (a key from def.contexts)
export type ThemePref = 'system' | 'light' | 'dark';
// Settings: theme: ThemePref   (DEFAULT_SETTINGS.theme = 'system')
```

### Task 11: Domain (subagent)

- `metrics.ts`: GLUCOSE.contexts = before_meal "Before meal", after_meal "After meal",
  fasting "Fasting", bedtime "Bedtime", other "Other"; `contextLabel(def, key): string | undefined`.
- `measurement.ts`: validate `context` ∈ def.contexts (error key `context`: "Choose an option
  from the list."); '' → undefined; revise keeps/updates it.
- `backup.ts`: optional `measurement.context` validated; optional `settings.theme` validated
  (absent → 'system').
- `csv.ts`: `context` column (label) right after `note`.
- New `share.ts`: `readingShareText(def, m, displayUnit, status: StatusKind): string` and
  `summaryShareText(def, ms, rangeLabel, displayUnit): string`. No notes; status text only when
  configured; ends with "Recorded with Sugar Daddy. Not medical advice."

### Task 12: Theme + HUD design system (subagent)

- `src/app/theme.ts`: `resolveTheme(pref: ThemePref, systemDark: boolean): 'light'|'dark'`,
  `applyTheme(pref)` (sets `html[data-theme]`, updates `meta[name=theme-color]`, listens to
  `prefers-color-scheme` when pref is 'system'; returns cleanup).
- `src/styles.css` rewritten with HUD tokens for `[data-theme=dark]` and `[data-theme=light]`,
  keeping every existing class name working; adds `.panel` (notched), `.label` (mono caps),
  `.ring`, `.tile`, `.seg`, `.switch`, `.icon-btn`, `.sticky-cta`.
- `src/ui/components/RingGauge.tsx`: props `{ value: string; unit: string; caption: string;
fraction?: number | null; tone?: StatusKind }` — arc fill only when `fraction` is a number.
- `scripts/contrast.test.mjs`: WCAG contrast of text tokens ≥ 4.5:1 and field borders ≥ 3:1
  in both themes, parsed from styles.css.

### Task 13: UI (lead), after 11–12

LogEntry (unit seg, date + time fields, context select), MetricDetail screen `#/metric/:id`
(chart point selection, recent rows with inline edit/delete, View all → `#/history/:metricId`,
sticky Add), Today hero ring + tiles, Guide `#/guide`, Share (`src/app/share.ts`:
`shareOrCopy(text): Promise<'shared'|'copied'|'unavailable'>`), Settings Appearance, header theme
toggle, History context filter. Integration + e2e updates.
