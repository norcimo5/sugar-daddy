# Sugar Daddy

**Your glucose. Your rules.**

Sugar Daddy is a small, private app for logging blood glucose, plus optional blood pressure,
weight and ketones. It runs in the browser, can be installed to a phone's home screen, works
offline, and keeps every record on the device.

> **Disclaimer:** Sugar Daddy records and displays measurements. It does not provide medical
> advice. Follow your care team's instructions.
>
> If you're in hospital, contact your nurse or care team with any concerns, symptoms, or
> questions about a reading.

## Features

- Log a glucose reading with one number: date and time are shown and default to now; unit
  (mg/dL or mmol/L), "when taken" (Before meal, After meal, Fasting, Bedtime, Other) and a note
  are optional.
- Optional metrics (off until you turn them on in Settings): blood pressure (systolic/diastolic
  in mmHg, optional pulse in bpm), weight (kg or lb), ketones (mmol/L).
- Values are stored exactly as entered, with the unit, time and time zone. Nothing is rounded,
  clamped or rewritten.
- Glucose display in mg/dL or mmol/L (display conversion only; records keep their original unit).
- Today screen: latest glucose in a ring gauge, a tile per measurement (latest value + Record),
  today's readings, next reminder, missed-reading banner.
- Per-measurement screen: chart (tap a point for its value, time and context), recent readings
  with Edit / Share / Delete, "View all", and a fixed "Add new record" button.
- Share a reading or a period summary through the phone's share sheet (or copy it). Notes are
  never included and nothing is sent unless you tap Share.
- A short "How to log a reading" guide (lightbulb button in the header).
- History and Trends: day / week / month views, filtered by metric, with simple charts that plot only real
  readings.
- Status (in range, above, below) only from target ranges and alert thresholds that you enter
  from your care team. With none entered it shows "No target range configured".
- Reminders: several times per day, each for one metric, with a grace period. Missed readings
  show in the app. A reading is never created automatically.
- Optional notifications while the app is open (see
  [known limitations](docs/known-limitations.md#notifications)).
- CSV export and JSON backup / restore with validation and a preview before anything changes.
- Playful or neutral wording, three text sizes, and a sci-fi HUD look in **light and dark**
  (Settings → Appearance: Match my phone / Light / Dark, or the sun/moon button in the header).
- No account, no analytics, no server.

## Requirements

- Node.js 20 or newer (developed with Node 26).
- npm (comes with Node).

## Commands

Run these from the project folder.

| Command                | What it does                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`          | Install dependencies.                                                                                                                 |
| `npm run dev`          | Start the development server (Vite). The service worker is not registered in dev mode.                                                |
| `npm test`             | Run unit and integration tests (Vitest, with `TZ=America/New_York`).                                                                  |
| `npm run e2e`          | Run end-to-end tests (Playwright) on all projects, including WebKit. Serves the production build with `vite preview`, so build first. |
| `npm run e2e:chromium` | Same, Chromium projects only (Pixel 7 and iPhone 14 viewports). Use this where WebKit can't launch.                                   |
| `npm run lint`         | ESLint.                                                                                                                               |
| `npm run typecheck`    | TypeScript type check (`tsc --noEmit`).                                                                                               |
| `npm run format:check` | Check formatting with Prettier (`npm run format` fixes it).                                                                           |
| `npm run build`        | Type check, build into `dist/`, then run `scripts/verify-pwa.mjs` on the output.                                                      |
| `npm run preview`      | Serve `dist/` at <http://localhost:4173>.                                                                                             |
| `npm run check`        | All gates in order: format check, lint, typecheck, tests, build, e2e (Chromium projects).                                             |

Before running `npm run e2e` for the first time, install the browsers:

```bash
npx playwright install chromium webkit
```

## Deploying

`npm run build` writes a static site to `dist/`. Upload the **contents** of `dist/` to any
static host that serves HTTPS.

**Why HTTPS:** browsers only allow service workers (needed for offline use) and app installation
on secure origins. `http://localhost` is exempt, which is why `npm run preview` works locally.
A plain `http://` address on a real host will load, but it will not work offline and cannot be
installed.

### Netlify or Cloudflare Pages

1. Run `npm run build`.
2. Either drag the `dist/` folder onto the Netlify or Cloudflare Pages dashboard, or use their
   CLI (`netlify deploy --prod --dir=dist`, or `wrangler pages deploy dist`).
3. `public/_headers` is copied into `dist/` and both hosts apply it automatically: the Content
   Security Policy (including `frame-ancestors 'none'`), `X-Content-Type-Options`,
   `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, and
   the cache rules below.

### GitHub Pages

- GitHub Pages cannot set custom headers. The Content Security Policy in the `<meta>` tag in
  `index.html` still applies, but `frame-ancestors`, `X-Frame-Options` and the other headers
  from `_headers` do not, and you cannot control caching.
- This repo deploys itself: `.github/workflows/pages.yml` runs format, lint, typecheck and unit
  tests, builds with `BASE_PATH=/<repo>/`, and publishes `dist/` on every push to `master`.
  Live at **https://norcimo5.github.io/sugar-daddy/**.
- Sub-paths work: build with `BASE_PATH=/your-path/ npm run build` (and preview with the same
  variable). The manifest uses relative URLs and the service worker derives its base from its
  scope.

### Any other server (nginx example)

Put the security headers in a snippet, because nginx drops inherited `add_header` lines inside
any `location` that sets its own:

```nginx
# /etc/nginx/snippets/sugar-daddy-headers.conf
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=(), interest-cohort=()" always;
add_header X-Frame-Options "DENY" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
```

```nginx
server {
    listen 443 ssl;
    server_name example.org;
    root /var/www/sugar-daddy;   # contents of dist/

    location / {
        include snippets/sugar-daddy-headers.conf;
        add_header Cache-Control "no-cache" always;
        try_files $uri /index.html;
    }

    location = /sw.js {
        include snippets/sugar-daddy-headers.conf;
        add_header Cache-Control "no-cache" always;
    }

    location = /manifest.webmanifest {
        include snippets/sugar-daddy-headers.conf;
        add_header Cache-Control "no-cache" always;
        default_type application/manifest+json;
    }

    # Hashed build files never change.
    location /assets/ {
        include snippets/sugar-daddy-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }
}
```

The `location /` block covers `/` and `/index.html` (and, as a side effect, icons, which is
harmless). The app uses `#/...` addresses internally, so `try_files` only matters for stray
paths.

### Cache rules

| Path                                                  | Cache-Control                         |
| ----------------------------------------------------- | ------------------------------------- |
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` | `no-cache`                            |
| `/assets/*`                                           | `public, max-age=31536000, immutable` |

## Installing on a phone

Open the deployed HTTPS address once while online, then:

### Android

- **Chrome:** open the address → tap the menu **⋮** → **Install app** (on some versions:
  **Add to Home screen**) → confirm.
- **Samsung Internet:** similar: open the menu and choose the add-to-home-screen / install
  option (or tap the install icon in the address bar, if shown).

### iPhone / iPad

1. On iOS older than 16.4 you must use **Safari**. From iOS 16.4, other browsers can also use
   Share → Add to Home Screen.
2. Tap **Share** (the square with an up arrow).
3. Tap **Add to Home Screen** → **Add**.
4. Launch Sugar Daddy from the home screen icon. It opens full-screen (standalone), without the
   browser bar.

## Updating the app

Deploy a new build to the same address. When the app notices the new version it shows an
**"Update available"** banner with a **Reload** button. Tap **Reload** to switch. If you don't, the new version is used
the next time the app starts after all of its windows and tabs have been closed.

## Your data: export, backup and restore

All records stay in this browser on this device. **Clearing browser data, uninstalling the app,
or iOS clearing storage for unused sites may delete your records.** Export regularly and keep
the files somewhere safe.

- **Export CSV** (Settings → **Export CSV**): a spreadsheet file
  (`sugar-daddy-<scope>-YYYY-MM-DD.csv`) with one row per value (blood pressure gives a row each
  for systolic, diastolic and pulse). Columns: id, metric, field, value, unit, entered_as,
  taken_at_local, time_zone, taken_at_utc, note, source, created_at, updated_at. For reading
  and sharing only; it cannot be imported back.
- **Backup** (Settings → **Download backup (JSON)**): a file
  (`sugar-daddy-backup-YYYY-MM-DD.json`) with all readings, reminders, metric settings and app
  settings.
- **Restore** (Settings → **Restore from backup**):
  1. Choose the backup file. It is checked first; a damaged or unsupported file is rejected
     with a message and nothing changes.
  2. A preview shows how many readings and reminders are new and how many are already on this
     device.
  3. Choose **Merge** (adds new records; when a record with the same ID already exists, the one on
     this device is kept; your current settings are kept) or **Replace all** (deletes
     everything on this device and loads the backup; asks you to confirm a second time).
  4. Nothing changes until you confirm. The restore is applied in a single step: if it fails,
     nothing is written.

## Target ranges and alert thresholds

Nothing is preset. Sugar Daddy never guesses a range. In **Settings**, open each measurement
and enter the target range (low / high) and alert thresholds (low / high) your care team gave
you, in that measurement's unit. All are optional. Until you enter any, readings show
"No target range configured". The app does not check whether the numbers you enter are
clinically correct.

## Privacy

- No account, no sign-in.
- No analytics, ads, trackers or telemetry.
- No network calls for your data: the app only loads its own files from the address it is served
  from. Readings are never sent anywhere.
- **No encryption at rest:** data is stored unencrypted in the browser's IndexedDB on this
  device. Anyone who can use this device's browser profile can read it.
- Notifications never include reading values.

## Project structure

```
src/
  domain/   Pure logic, no browser storage or DOM: types, metric definitions, validation,
            units, thresholds, time, reminders, CSV, backup, copy text
  db/       IndexedDB open + versioned migrations (idb.ts) and repository (repo.ts)
  app/      App state hook, injectable clock, notifications, service-worker registration,
            download helper, double-submit guard
  ui/       Preact screens and components
  main.tsx  Entry point
public/     manifest.webmanifest, sw.js (service worker), _headers, icons/
scripts/    verify-pwa.mjs (build check), make-icons.sh (icons from assets/*.svg)
e2e/        Playwright tests
docs/       requirements, architecture, implementation plan, test plan, known limitations
vite-plugin-precache.ts   Writes the precache list and build id into dist/sw.js
```

See [docs/architecture.md](docs/architecture.md) for details and
[docs/known-limitations.md](docs/known-limitations.md) for what the app does not do.

## Testing on a fixed clock

The app reads its starting time from `window.__SD_NOW__` (an ISO date string) if it is set
before the app loads; time then moves forward normally from that instant. The end-to-end tests
set it with Playwright's `page.addInitScript`, so reminder and missed-reading states can be
tested deterministically. See [docs/test-plan.md](docs/test-plan.md).

## Verification status

Recorded 2026-11-03 on Linux (Node 26.3.0), from a fresh `npm run check` (exit 0):

| Gate                               | Result                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `prettier --check`                 | All files formatted                                                                              |
| `eslint .`                         | 0 problems                                                                                       |
| `tsc --noEmit` (strict)            | 0 errors                                                                                         |
| Unit + integration (`npm test`)    | 27 files, **671 tests passed** (incl. 72 WCAG contrast checks, both themes)                      |
| Production build (`npm run build`) | Built to `dist/` (~80 kB JS, 27 kB gzipped); `verify-pwa`: 21/21 checks passed                   |
| E2E `android-chromium` (Pixel 7)   | 12/12 passed                                                                                     |
| E2E `iphone-viewport-chromium`     | 12/12 passed                                                                                     |
| E2E `iphone-webkit`                | **Not run** — WebKit cannot launch on the build machine (missing `libmanette-0.2-0`, needs sudo) |
| `npm audit --omit=dev`             | 0 vulnerabilities (dev-only: 11 moderate in ESLint's `minimatch`)                                |

E2E covers the full patient workflow (launch → log without a note, timed well under 10 s → Today
and History → edit → delete with confirmation → CSV and JSON export → restore with preview and
merge → reminders and the missed indicator on a fixed clock → offline reload and offline
logging), plus manifest, icon sizes, service-worker activation, no console errors and no
requests to other origins.

**Not verified:** installation and use on physical Android and iOS devices, iOS Safari/WebKit
behaviour, screen readers (TalkBack/VoiceOver), and deployment to a real HTTPS host. See
`docs/known-limitations.md` and the manual checklist in `docs/test-plan.md`.

### How it was built

The Superpowers skills used were `brainstorming` (requirements and the two operator questions),
`writing-plans` (`docs/implementation-plan.md`), `test-driven-development` (each module was
written test-first, with parallel subagents on separate files), `systematic-debugging` (root
causes for the offline cache miss, test races and copy defects), `requesting-code-review` (an
independent review; all critical and important findings were fixed, see git history) and
`verification-before-completion` (this record).
