# Sugar Daddy — Requirements

> Tagline: **Your glucose. Your rules.**
> Source: `PROMPT.md` (product brief) + operator answers, 2026-11-03.
> Process: Superpowers `brainstorming` → `writing-plans` → `test-driven-development` →
> `systematic-debugging` → `requesting-code-review` → `verification-before-completion`.

## 1. Operator decisions (recorded verbatim in meaning)

| Question             | Answer                                                  | Consequence                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Second daily metric  | "2 and 3" (blood pressure, weight), then "add Ketones!" | Ship **four** metrics: glucose, blood pressure, weight, ketones.                                                                                                                                     |
| Units                | Not specified beyond the examples offered               | Glucose **mg/dL** (default) with tested mmol/L conversion; BP **mmHg** (systolic/diastolic pair, optional pulse bpm); weight **kg or lb** chosen in Settings, stored as entered; ketones **mmol/L**. |
| Clinician thresholds | "Unknown for now" **and** "I'll type them"              | No thresholds shipped. Status shows **"No target range configured"** until the user enters clinician values in Settings.                                                                             |

Glucose is the primary metric and the only one enabled by default. The other three are
**disabled until the user turns them on** in Settings (the brief: "do not show a second metric
until it has been selected and configured"). The operator selected them, so they are fully
implemented, not stubs.

## 2. Users and goals

Primary user: a hospitalized, non-technical, possibly tired patient using one hand on a phone.

- G1 Log a glucose reading in < 10 s on the common path, no typing beyond the number, no note.
- G2 Data private and local; works offline; exportable and restorable.
- G3 Calm, respectful health information; playful copy only in low-stakes places, switchable off.

## 3. Functional requirements (testable)

### Today (FR-T)

- T1 Shows current local date, human-readable.
- T2 Shows latest glucose reading: value, unit, timestamp.
- T3 Shows a status (text + icon, never colour only) derived **only** from configured thresholds;
  otherwise "No target range configured".
- T4 Large high-contrast **Log glucose** button, first in tab order after the header.
- T5 Today's readings (all enabled metrics) in reverse chronological order.
- T6 Next reminder time when reminders exist.
- T7 Missed-reading banner when a scheduled reading is unlogged past its grace period; has
  "Log now" and "Not needed" actions.
- T8 Bottom navigation: Today, History, Trends, Settings.
- T9 Empty, loading and storage-error states. No sample data ever shown.

### Logging (FR-L)

- L1 Numeric input, `inputmode="decimal"`, large font, autofocused.
- L2 Validation: must be a finite number in the metric's technical range (glucose mg/dL 10–1000,
  mmol/L 0.5–55; BP systolic 40–300, diastolic 20–200, pulse 20–250; weight kg 1–500, lb 2–1100;
  ketones 0–15). Out-of-range → accessible error, **no clamping, rounding or rewriting**.
- L3 The exact entered text value is preserved (stored as the parsed number plus the original
  string), with the unit at time of entry.
- L4 Timestamp defaults to now (device time zone, IANA zone stored); editable via "Change time".
- L5 Optional note behind an "Add note" disclosure.
- L6 One Save button; double-tap protection (in-flight guard); disabled while saving.
- L7 Save confirmation (live region toast) then return to Today.
- L8 Edit and delete existing readings; delete requires confirmation.
- L9 `createdAt` / `updatedAt` maintained.
- L10 A save is only reported successful after the IndexedDB transaction completes; failures
  show an error and keep the form contents.

### Metric model (FR-M)

- M1 Metric definitions are data + adapter: id, name, unit(s), value schema (fields with
  precision and ranges), thresholds, enabled, order, timestamps.
- M2 Measurement: id (UUID), metricId, `value` (structured `Record<field, number>`),
  `raw` entered strings, unit, `takenAt` (ISO UTC), `timeZone`, `note`, `source`
  (`manual` | `import`), `createdAt`, `updatedAt`.
- M3 No `if (metric === 'glucose')` in UI; UI renders from the metric definition.
- M4 Multi-field metrics (BP) supported.
- M5 Extension point documented; tested with a clearly labelled test-only fixture metric.

### History & Trends (FR-H)

- H1 Day / Week / Month range selection, with previous/next navigation.
- H2 Metric filter; one chart per metric (no mixed axes).
- H3 SVG chart: points at real times only, labelled axes with units and range; target band only
  when configured; no interpolation beyond straight segments between consecutive real points
  (sparse data shows points only when fewer than 2 readings).
- H4 Accessible summary text (count, min, max, latest) + the list of readings as the data table
  equivalent.
- H5 Rows: date/time, value, unit, note indicator; tap to open edit/delete.
- H6 With < 3 readings, no trend language; summary only states counts and values.

### Reminders (FR-R)

- R1 Multiple reminders: time (HH:MM), metric, enabled flag.
- R2 Global grace period (default 60 min, configurable 15–240).
- R3 A slot is **satisfied** by any reading of that metric from 2 h before its time through the
  end of the grace window; **missed** after the grace window with no satisfying reading
  and not dismissed.
- R4 "Not needed" dismisses a slot for that date without creating a reading.
- R5 Next reminder shown on Today.
- R6 Notifications: opt-in only; permission requested only on explicit enable; test
  notification button; while the app is open/backgrounded with an active page, a timer shows a
  notification once per slot (no repeats). No push server. Limitations documented honestly.
- R7 Quiet hours: not implemented (documented).

### Export / backup (FR-E)

- E1 CSV export of all measurements, or one metric; headers include metric, field, value, unit,
  taken-at local, time zone, ISO UTC, note, source.
- E2 RFC 4180 escaping (commas, quotes, CR/LF); formula-injection guard for spreadsheet cells
  beginning with `= + - @` in text fields (note).
- E3 Filename `sugar-daddy-<scope>-YYYY-MM-DD.csv`.
- E4 JSON backup `sugar-daddy-backup-YYYY-MM-DD.json` containing format id, schema version,
  export time, settings, metric configs, reminders, measurements.
- E5 Restore: parse → validate (format, version, each record) → preview (counts, new vs
  duplicate) → user chooses **Merge (keep existing on duplicate ID)** or **Replace all** (second
  confirmation) → apply in one transaction. Malformed/unsupported → clear error, nothing changed.
- E6 Backup status line: "Last backup: <date>" / "Never backed up", no nagging.
- E7 Plain-language warning that clearing browser data / uninstalling may erase records.

### Settings (FR-S)

- S1 Glucose unit mg/dL or mmol/L (display conversion only; records keep original unit/value).
- S2 Per-metric target range low/high and alert low/high, entered in the metric's unit; all
  optional; validation low < high.
- S3 Enable/disable BP, weight, ketones; weight unit kg/lb.
- S4 Reminders and grace period.
- S5 Notification status, enable, test notification.
- S6 Playful vs neutral tone.
- S7 Text size: Standard / Large / Extra large.
- S8 Export / restore; privacy information; About with disclaimer, version and build.

## 4. Safety (FR-X)

- X1 No diagnosis, advice, dose calculators, or emergency language.
- X2 Status labels only: "In target range", "Below target range", "Above target range",
  "Below low alert", "Above high alert", or "No target range configured". Neutral wording always.
- X3 Out-of-range readings never get playful copy or celebration.
- X4 Persistent disclaimer in About and on first run: "Sugar Daddy records and displays
  measurements. It does not provide medical advice. Follow your care team's instructions." plus
  "If you're in hospital, contact your nurse or care team with any concerns, symptoms, or
  questions about a reading."

## 5. Non-functional

- Privacy: no network calls besides same-origin static assets; CSP `default-src 'self'`;
  no console logging of readings.
- Persistence: IndexedDB, versioned schema with tested migrations; `navigator.storage.persist()`
  requested once.
- Accessibility: WCAG 2.2 AA target — 44 px targets, focus rings, labels, live regions,
  reduced motion, light + dark themes, contrast ≥ 4.5:1 for text.
- PWA: manifest (standalone, icons 192/512/maskable/apple-touch), service worker precaching the
  shell, offline launch.
- Quality gates: Prettier, ESLint, `tsc --noEmit`, Vitest (unit + integration), Playwright e2e
  (mobile viewport, offline reload), production build.

## 6. Out of scope

Everything listed as non-goals in PROMPT.md §2, plus: quiet hours, cloud sync, push server,
encryption at rest (not implemented and not claimed).
