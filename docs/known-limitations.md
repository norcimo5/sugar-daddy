# Sugar Daddy — Known Limitations

This is an honest list of what Sugar Daddy does not do, or does only partly. Some are platform
limits of web apps; some are deliberate scope decisions.

## Not a medical device

Sugar Daddy is a personal logging and display tool. It is not a medical device, not a
diagnostic system, and not a hospital-approved charting system. It gives no medical advice.
Follow your care team's instructions.

## Notifications

- **There is no push server.** Sugar Daddy has no backend, so it cannot send notifications to a
  closed app.
- Reminder notifications come from a timer inside the page. They can only fire while the app is
  open, or recently put in the background and still kept alive by the browser. Each reminder
  notifies at most once per day; the "already notified" list (reminder id + date only) is kept in
  `localStorage`, so a reload does not re-notify. If browser storage is blocked (some private
  modes) it falls back to memory, and a reload could then notify once more.
- **iOS / iPadOS:** web notifications need iOS 16.4 or later **and** the app installed to the
  Home Screen. Even then there is no reliable scheduled background notification: once iOS
  suspends the app, the timer stops.
- **Android Chrome:** the browser may throttle or pause timers in background tabs and installed
  apps, so a notification can be late or not appear until you open the app.
- **The reliable mechanism is in the app:** the Today screen shows the next reminder and a
  missed-reading banner whenever you open it, whether or not any notification was shown.
- Notifications never include a reading value.

## Quiet hours

Not implemented. Reminders with notifications enabled may notify at any time you schedule them.

## Storage can be lost

- Records live only in this browser's IndexedDB on this device.
- The app requests persistent storage (`navigator.storage.persist()`), but the
  browser decides. Even with it, browsers may evict data under storage pressure.
- Clearing browser data, clearing site data, or uninstalling the app deletes the records.
- **iOS** may delete the storage of websites that have not been used for several weeks,
  particularly if the app was not added to the Home Screen.
- **Export regularly** (CSV and JSON backup in Settings). Local browser storage is not a
  guaranteed medical-record backup.

## No encryption at rest

Data is stored unencrypted in IndexedDB. Anyone with access to the device's unlocked browser
profile (or its files) can read it. Backup and CSV files are plain text too.

## No cloud sync or multiple devices

There is no account and no sync. Each device has its own separate data. To move data, download a
JSON backup on one device and restore it on the other.

## Units

- Each metric is shown in one unit at a time (the one chosen in Settings). There is no
  side-by-side display of two units.
- Glucose mg/dL ⇄ mmol/L uses the factor **18.0156** and is for **display only**. Stored
  records always keep the value and unit as entered. Thresholds are entered in the metric's
  current unit.
- The set of units is a closed list (`UNITS` in `src/domain/types.ts`): mg/dL, mmol/L, mmHg, kg,
  lb. Pulse uses a fixed "bpm" label on its field rather than a `Unit`.

### Adding a new metric

1. Add a `MetricDefinition` in `src/domain/metrics.ts` (id, names, units, fields with limits per
   unit, primary and threshold fields, `defaultEnabled`, `order`) and add it to
   `BUILTIN_METRICS`.
2. If it needs a unit that is not in the list, add it to `UNITS` in `src/domain/types.ts` (the
   `Unit` type and backup validation both derive from it) and to the display-decimals table in
   `src/domain/units.ts` (plus a conversion in `RELATIONS` there if it should convert).
3. No UI changes should be needed for a single-field metric: screens render from the metric
   definition. (Glucose is the primary metric with its own place on Today.)
4. Add tests: definition and validation in `metrics.test.ts` / `validation.test.ts`, and backup
   round trip in `backup.test.ts`.

Existing backups remain valid; a backup that contains the new metric will be rejected by an older
app version ("unknown metric").

## Clinician thresholds are not checked

Target ranges and alert thresholds are typed in by the user. The app only checks that they are
in a sensible order (alert low ≤ target low < target high ≤ alert high). It cannot check that
they are what the care team actually prescribed. Nothing is preset.

## Time zones and daylight saving

- Each reading stores its time as a UTC instant plus the time zone of the device when it was
  logged. CSV exports show the local time in that original zone.
- Grouping by day, week and month (Today, History, Trends) and reminder times use the device's
  **current** time zone. After travelling, older readings may appear on a different day than
  where they were logged.
- Reminder times are local wall-clock times. On the spring-forward day, a reminder set inside
  the skipped hour (for example 02:30 in the US) is treated as the shifted time (03:30).

## CSV is export-only

CSV files are for reading in a spreadsheet or sharing. They cannot be imported. Use the JSON
backup to restore data.

## Device testing

Sugar Daddy has **not** been tested on physical phones. Automated end-to-end tests run in
Playwright emulation only:

- `Pixel 7` device profile in Chromium (Android-sized viewport).
- `iPhone 14` device profile in WebKit. WebKit emulation on a desktop is **not** iOS Safari:
  it does not reproduce Home Screen installation, iOS storage eviction or iOS notification
  behaviour.

Installation, screen readers (VoiceOver, TalkBack), 200% text zoom, dark mode and reduced
motion on real devices are listed as manual checks in `docs/test-plan.md` and have not yet been
performed.

## Dependency audit

`npm audit` reports 11 moderate advisories, all in `minimatch` pulled in by ESLint (development
tooling only, not shipped in the app). `npm audit --omit=dev` (runtime dependencies) reports 0.
