# Sugar Daddy — Architecture

## Stack (decided)

| Concern        | Choice                                                                  | Why                                                                            |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Language       | TypeScript (strict)                                                     | Typed domain model, catches unit/field mistakes.                               |
| UI             | Preact 10 + hooks                                                       | ~4 kB, React-like components, no global store needed.                          |
| Build          | Vite                                                                    | Fast dev server, static output for any HTTPS host.                             |
| Storage        | IndexedDB via a ~150-line hand-written wrapper (`src/db`)               | No dependency; full control of transactions and errors.                        |
| Charts         | Hand-written SVG component                                              | No chart library; honest rendering of real points only.                        |
| Service worker | Hand-written `public/sw.js` + Vite plugin that writes the precache list | Small and auditable; no Workbox.                                               |
| Tests          | Vitest + jsdom + fake-indexeddb + @testing-library/preact; Playwright   | Unit/integration in Node, e2e in Chromium (Pixel/iPhone viewports) and WebKit. |
| Lint/format    | ESLint (typescript-eslint) + Prettier                                   |                                                                                |

Runtime dependencies: `preact` only.

## Module boundaries

```
src/
  domain/            pure, deterministic, no DOM, no IndexedDB
    types.ts         Measurement, MetricDefinition, Settings, Reminder…
    metrics.ts       built-in metric registry (glucose, bp, weight, ketones) + adapters
    validation.ts    parse/validate entered strings against a metric's value schema
    units.ts         glucose mg/dL ⇄ mmol/L, kg ⇄ lb (display only)
    thresholds.ts    evaluate a measurement against configured thresholds → status
    time.ts          local-day boundaries, formatting, ranges (day/week/month)
    reminders.ts     due/next/missed evaluation for a given clock instant
    csv.ts           CSV serialisation + escaping
    backup.ts        JSON backup build / validate / merge planning
    copy.ts          playful vs neutral strings
  db/
    idb.ts           open + migrations (versioned), promise helpers
    repo.ts          measurements / settings / reminders / dismissals CRUD
  app/
    state.ts         useAppData hook: loads from repo, exposes actions, refreshes
    clock.ts         injectable clock (tests and e2e can fix the time)
    notify.ts        Notification permission + in-page scheduler
    download.ts      Blob download helper
  ui/
    App.tsx, screens/{Today,Log,History,Trends,Settings}.tsx
    components/{BigButton,MeasurementRow,MetricSummary,Chart,Toast,Banner,Dialog}.tsx
  main.tsx           mount, register service worker
public/
  manifest.webmanifest, sw.js, icons/
```

Rule: `domain/` imports nothing from `db/`, `app/` or `ui/`. UI never branches on a metric id;
everything comes from `MetricDefinition` (fields, unit labels, precision, ranges).

## Data model

```ts
MetricDefinition {
  id: MetricId; name; shortName; unitOptions: Unit[]; defaultUnit;
  fields: FieldDef[];          // [{key:'value', label, precision, ranges by unit}] or systolic/diastolic/pulse
  primaryField: string;        // field used for threshold evaluation and charts
  builtIn: true; order: number;
}
MetricConfig {                 // user/clinician-editable, persisted
  metricId; enabled; unit; thresholds?: { targetLow?, targetHigh?, alertLow?, alertHigh? } per field;
  createdAt; updatedAt;
}
Measurement {
  id: string (crypto.randomUUID); metricId; value: Record<string, number>;
  raw: Record<string, string>; unit; takenAt: ISO UTC; timeZone: IANA;
  note?: string; source: 'manual' | 'import'; createdAt; updatedAt;
}
Reminder { id; time: 'HH:MM'; metricId; enabled; createdAt; updatedAt }
Dismissal { id: `${reminderId}@${YYYY-MM-DD}`; reminderId; date; createdAt }
Settings  { tone: 'playful'|'neutral'; textSize; graceMinutes; notificationsEnabled;
            lastBackupAt?; firstRunDone; }
```

Thresholds are stored in the metric's configured unit; when the glucose display unit changes,
thresholds are converted with the same tested conversion, and records are never rewritten.
Status evaluation converts the measurement value to the threshold unit (glucose only; weight
thresholds in kg/lb likewise).

## IndexedDB schema

DB `sugar-daddy`, version 1:

- `measurements` (keyPath `id`, index `by_metric_takenAt` [metricId, takenAt], index `by_takenAt`)
- `metricConfigs` (keyPath `metricId`)
- `reminders` (keyPath `id`)
- `dismissals` (keyPath `id`)
- `kv` (keyPath `key`) — settings and `schemaMeta`

Migrations are an ordered array `migrations[n](db, tx)` applied in `onupgradeneeded` from
`oldVersion` to `CURRENT_VERSION`. Tests open v0→v1 and verify seed/default behaviour; a test-only
v2 migration fixture verifies upgrade ordering preserves data.

Every write awaits `tx.oncomplete`; `onerror`/`onabort` (including `QuotaExceededError`)
reject, and the UI shows "Not saved" with the reason.

## Reminder evaluation

Pure function `evaluateReminders(now, reminders, measurements, dismissals, graceMinutes, tz)` →
for each enabled reminder today: `upcoming | due | satisfied | missed | dismissed`, plus `next`.
Satisfaction window: `[slot − 120 min, max(slot + grace, next same-metric slot − 120 min | midnight))`. The UI re-evaluates every 30 s and on
visibility change. `notify.ts` fires one `Notification` (via the service-worker registration
when available) when a slot first becomes due while the page is alive; fired slots are remembered
per day (keys `${reminderId}@${date}` only, in memory and `localStorage`) so a reload never
re-notifies.

## Service worker

`sw.js` precaches `index.html` + hashed assets (list injected at build into
`sw.js` as `self.__PRECACHE`), cache name includes the build id. Navigation requests → cache-first
`index.html` fallback; assets → cache-first. On activate deletes old caches. Update flow: the page
detects a waiting worker and shows an "Update available" banner with a Reload button.

## Security headers (deployment)

`public/_headers` (Netlify/Cloudflare Pages format) and documented equivalents:
`Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self'
'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';
frame-ancestors 'none'`, plus `X-Content-Type-Options`, `Referrer-Policy: no-referrer`,
`Permissions-Policy`. The same CSP is set via `<meta http-equiv>` for hosts without header
control (frame-ancestors is header-only).

## Trade-offs

- No date library: `Intl.DateTimeFormat` covers formatting; day boundaries computed in local
  time via `Date` (device zone). Records store the IANA zone for context in exports.
- No push server → background notifications are best-effort (documented in known-limitations).
- Hand-written SW instead of Workbox: fewer deps; tested by Playwright offline reload.
