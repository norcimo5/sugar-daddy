# SUGAR DADDY — Production-Ready App Generator Prompt

> **Product:** Sugar Daddy  
> **Tagline:** Your glucose. Your rules.  
> **Deliverable:** A complete, tested, installable Progressive Web App (PWA) for Android and iPhone.  
> **Primary user:** A hospitalized patient who is not very technical.  
> **Product principle:** Make logging almost effortless, keep the data private, and never get in the patient's way.

---

## 0. Instructions to the AI app-building agent

You are the senior product engineer, UX designer, accessibility specialist, security reviewer, and test engineer responsible for delivering **Sugar Daddy** as a working application—not merely a mockup, prototype, design, or scaffold.

Build the actual application, run it, test it, fix defects, and provide a deployable production build. Do not stop after writing a plan or generating placeholder screens.

### Mandatory use of Superpowers

Use the **Superpowers plugin/skills framework** throughout requirements development and implementation.

1. Verify that Superpowers is available and enabled in your agent environment. Do not claim to have used it if it is unavailable.
2. Use its requirements discovery/specification workflow to turn this prompt and the operator's answers into clear, testable requirements.
3. Use its planning/design workflow to produce an implementation plan and architecture before coding.
4. Use its test-driven development workflow: establish failing tests before implementing behavior, implement the smallest correct change, and make the tests pass.
5. Use its debugging/root-cause workflow for failures. Do not paper over failures or disable tests to get a green build.
6. Use its code-review and completion-verification workflow before declaring the product done.
7. Keep requirements, decisions, implementation plan, and test results in the repository. Suggested artifacts: `docs/requirements.md`, `docs/architecture.md`, `docs/implementation-plan.md`, `docs/test-plan.md`, and `docs/known-limitations.md`.
8. Use the actual Superpowers workflows exposed by the installed version. Do not invent skill names or assume command syntax.
9. If Superpowers is unavailable, report that blocker to the operator before implementation. Do not silently substitute another methodology or falsely report Superpowers usage.

### Work style

- Work incrementally and keep the app runnable.
- Prefer a small, understandable, maintainable codebase over unnecessary abstractions.
- Do not add features that are not requested unless needed for safety, privacy, accessibility, reliability, or installability.
- Do not leave TODOs, fake data, dead buttons, placeholder screens, or mocked persistence in the final product.
- Do not claim a feature works until it has been implemented and tested.
- Document important technical trade-offs concisely.
- Preserve the product's playful personality without making fun of the patient, their condition, or a concerning health reading.

---

## 1. First interaction: resolve exactly two product questions

Before implementation, ask the operator **exactly these two questions**, in one concise message. The platform decision is already made: build an installable PWA for Android and iPhone. Do not ask native app vs. PWA.

1. **What is the second daily health metric the patient wants to track?** Examples: blood pressure, weight, ketones, temperature, or another metric. Ask for the metric and its units if known. If unknown, record it as a pending decision and design a clean extension point so it can be added later without redesigning the app.
2. **What glucose target range and low/high alert thresholds has the patient's clinician recommended?** Capture values and units exactly as provided. If unknown, do not invent medical thresholds; allow the app to operate with neutral, unconfigured status labels until clinician-approved values are entered.

Do not ask a third question before starting. Screenshots of the patient's current app may be offered as optional reference material, but their absence must not block progress. Do not infer clinical settings from screenshots.

After receiving answers, update the requirements and proceed. If the second metric remains unknown, implement glucose completely and leave a documented, tested extension point. Do not invent the missing metric.

---

## 2. Product vision and goals

Create a fast, calm, friendly, extremely simple health-tracking app for a person who may be tired, stressed, or unfamiliar with technology.

The core workflow:

1. Open the app.
2. Tap a large **Log glucose** action.
3. Enter or select the reading.
4. Optionally add a note.
5. Save and immediately see confirmation and updated history.

The common logging workflow should take less than **10 seconds**, require no typing for the common case, and be usable with one hand on a phone.

### Brand and personality

The app is named **Sugar Daddy**.

- Tagline: **Your glucose. Your rules.**
- Use tasteful, playful copy in low-stakes places: onboarding, empty states, success messages, and optional reminders.
- Example tone: “Daddy says you're looking good.” / “Reading saved. Sweet and simple.”
- Never use jokes, teasing, shame, sexualized language, or sarcasm when a reading is outside a configured range, a reminder is missed, or the user may be unwell.
- Health information must always be clear, respectful, calm, and unambiguous.
- Provide a setting to turn playful copy off and use a neutral tone.
- Avoid a childish or cartoonish visual style. The product should feel polished, modern, trustworthy, and approachable.

### Primary goals

- Very fast glucose logging.
- Clear history and trends.
- Useful reminders and visible missed-reading status.
- Local-first, offline-capable data storage.
- Easy data export and recovery.
- Installable experience on Android and iPhone.
- Extensible metric architecture for a second daily measurement.
- No advertisements, tracking, upsells, subscriptions, or unnecessary distractions.

### Explicit non-goals

Unless separately requested, do not build:
- Medical diagnosis or treatment recommendations.
- Insulin-dose, medication, or treatment calculators.
- Automatic interpretation of symptoms.
- A clinician portal, hospital integration, or electronic health-record integration.
- Social feeds, leaderboards, gamification, or account creation.
- Cloud synchronization or a backend database.
- Advertising, analytics trackers, or monetization.
- Bluetooth or medical-device integrations.
- AI-generated medical advice.

---

## 3. Required platform and delivery

Build a **Progressive Web App (PWA)** from one lightweight codebase.

### Required platform behavior

- Responsive, phone-first layout that also works on tablets and desktop browsers.
- Installable on Android through supported Chromium-based browsers.
- Installable on iPhone/iPad through Safari's **Add to Home Screen** flow.
- Standalone display mode when launched from the home screen.
- App name, short name, theme color, background color, and correct application icons.
- Web App Manifest with appropriate display mode, start URL, scope, and icon sizes.
- Service worker for application-shell caching and offline launch.
- HTTPS deployment requirement documented clearly.
- No dependency on an app store for installation.
- No separate native Android/iOS codebases.

### Installation and deployment documentation

Provide tested, exact steps for:
- Running locally in development.
- Building the production bundle.
- Deploying to a static HTTPS host.
- Installing on Android.
- Installing on iPhone/iOS.
- Updating the installed app.
- Exporting and restoring user data.

Do not state that the PWA is installable until its manifest, service worker, icons, HTTPS deployment behavior, and installation instructions have been checked.

---

## 4. Functional requirements

### 4.1 Home / Today screen

The home screen is the primary interface and must make the next action obvious.

Display:
- Current local date in a human-readable format.
- Most recent glucose reading, including value, unit, and timestamp.
- A clear status indicator based only on clinician-configured thresholds, if present.
- A prominent, high-contrast **Log glucose** button.
- Today's readings in reverse chronological order.
- Next reminder time, if reminders are configured.
- A visible missed-reading indicator when a scheduled reading has not been logged within its configured grace period.
- Simple navigation to History, Trends, and Settings.

Handle empty, loading, offline, and error states gracefully. Never display sample readings as if they were real patient data.

### 4.2 Glucose logging

The glucose logging flow must:
- Support mg/dL as the initial/default unit.
- Make the numeric entry control large, readable, and easy to operate.
- Use a numeric keypad on mobile where supported.
- Allow manual numeric entry. Quick-entry values or a stepper may be added only if usability testing shows they help; never constrain the user to presets.
- Validate numeric input and a deliberately broad technical input range. Do not silently clamp, round, or rewrite a reading.
- Preserve the exact entered value and unit.
- Capture the measurement timestamp automatically using the device's local time zone.
- Allow correction of the timestamp for delayed or historical entries.
- Include an optional note field, unobtrusive by default.
- Save with one obvious action.
- Confirm successful save and return the user to a useful view.
- Prevent accidental duplicate submissions from rapid repeated taps.
- Support editing and deleting a reading, with confirmation before deletion.
- Preserve created/updated timestamps where practical.

Common-path target: under 10 seconds, with no note required.

Do not automatically label a value “safe,” “dangerous,” “normal,” or “critical” unless configured clinician-approved rules explicitly support that label. Never use color as the only status indicator.

### 4.3 Extensible second metric

The application must not be architected as a glucose-only database or glucose-only chart.

Create a generic metric definition with:
- Stable metric identifier.
- Display name.
- Unit.
- Value type and validation rules.
- Decimal precision support where appropriate.
- Optional clinician-configured target range and alert thresholds.
- Optional metadata/context fields.
- Enabled/disabled state.
- Display order.
- Created/updated timestamps.

A measurement record should include:
- Unique ID.
- Metric ID.
- Numeric value stored without lossy conversion.
- Unit as recorded at the time of measurement.
- Measurement timestamp and time-zone context.
- Optional note.
- Created and updated timestamps.
- Optional source/method metadata if useful.

Keep metric-specific validation and presentation in metric definitions/adapters rather than scattering `if glucose` conditions throughout the application. The first metric is glucose. The second metric must be configurable once the operator supplies it. Do not assume that every metric is a single scalar: for example, blood pressure may require systolic and diastolic values. The model must support a structured value payload or metric-specific value schema so such metrics can be added cleanly.

Do not show a second metric in the UI until it has been selected and configured. If it is not yet known, document the extension point and demonstrate its correctness with tests using a clearly labeled test fixture, not fake patient data.

### 4.4 History and trends

Provide:
- Daily, weekly, and monthly views.
- A readable chart of measurements over time.
- A chronological list of recent readings.
- Date/time, value, unit, and note indicator for each entry.
- Filters by metric and date range.
- Clear empty states when no readings exist.
- Accessible chart summaries or an equivalent data table/list for screen readers and users who cannot interpret charts.
- No misleading interpolation or fabricated readings.
- A way to inspect an individual reading and edit/delete it.

Chart behavior:
- Use actual saved measurements only.
- Label axes, units, and time ranges.
- Handle sparse data and multiple readings at the same time correctly.
- Make target bands visible only when configured.
- Do not imply a clinical trend from insufficient data.
- Avoid combining unlike metrics on one numerical axis.

### 4.5 Reminders and missed-reading indicators

Provide configurable reminders for the user's intended schedule.

Requirements:
- Allow multiple reminder times per day.
- Enable/disable each reminder independently.
- Let the user choose which metric each reminder is for.
- Provide a configurable grace period for determining when a reading is missed.
- Show the next scheduled reminder and a visible missed-reading state on the home screen.
- Allow the user to mark a reminder as not needed or dismiss its missed state without creating a measurement.
- Do not create a reading automatically when a reminder fires.
- Do not repeatedly nag the user.
- Respect quiet hours if implemented.
- Explain permission requirements clearly and request notification permission only after the user explicitly enables notifications.

**Important PWA limitation:** Browser and operating-system support for scheduled notifications differs, especially on iOS. Do not promise reliable background or exact-time notifications on every device. Implement the strongest supported reminder behavior, document platform limitations, and ensure the in-app missed-reading indicator works even when push/local notifications cannot run in the background. If reliable background notifications require a server or push service, do not add one silently; explain the trade-off and keep the core app fully functional without it.

### 4.6 Data export, backup, and restore

All patient data must remain under the user's control.

- Store data locally on the device by default.
- Provide CSV export for each metric and/or all measurements.
- Include headers, units, timestamps with time-zone context, and notes.
- Escape CSV fields correctly, including commas, quotes, and newlines.
- Use a predictable, descriptive filename.
- Provide a JSON backup export containing all data and settings needed for restoration.
- Provide JSON import/restore with schema validation and a preview/confirmation step.
- Never overwrite existing data silently.
- Detect duplicate IDs and define a safe merge/replace policy.
- Validate imported files and reject malformed or unsupported versions with a useful error.
- Include a backup reminder or unobtrusive backup status, but never nag.
- Make clear that uninstalling or clearing browser data may erase local records unless they have been exported.
- Do not claim that local browser storage is equivalent to a guaranteed medical-record backup.

### 4.7 Settings

Include settings for:
- Glucose unit (mg/dL; add mmol/L only if conversion is implemented and tested).
- Clinician-provided target range and alert thresholds.
- Reminder schedule and grace period.
- Notification permission/status and a test-notification action where supported.
- Playful vs. neutral language.
- Text size or display density if useful.
- Export and restore.
- Privacy/data information.
- App version and build information.

If supporting mg/dL and mmol/L, use explicit, tested conversion logic and always retain the original entered value/unit in the stored measurement. Clearly show the currently selected unit. Do not silently convert historical values in a way that changes the original record.

---

## 5. Safety and medical boundaries

This is a personal logging and visualization tool, **not a medical device, diagnostic system, or substitute for clinician instructions**.

- Do not diagnose, prescribe, recommend treatment, or advise medication/insulin changes.
- Do not tell the user to ignore symptoms or delay contacting clinical staff.
- Do not generate medical interpretations from readings.
- Do not invent target ranges, alert thresholds, or medical cutoffs.
- Use only clinician-provided thresholds when displaying low/high status.
- If thresholds are not configured, show a neutral status such as **“No target range configured”**, not a guessed status.
- Clearly distinguish a user-entered measurement from a calculated or imported value.
- Provide a persistent, concise disclaimer in About/Help: “Sugar Daddy records and displays measurements. It does not provide medical advice. Follow your care team's instructions.”
- Include a clear instruction that a hospitalized patient should contact their nurse or care team for concerns, symptoms, or questions about a reading.
- Do not use emergency language or make clinical claims based solely on an entered number.
- Do not display celebratory animations for readings outside configured ranges.
- Never obscure the measurement value with decorative UI.

The app should be usable by a patient in a hospital, but it is not a hospital-approved charting system unless separately reviewed and approved by the relevant institution.

---

## 6. UX, visual design, and accessibility

Design for a patient who may have reduced energy, limited dexterity, poor lighting, or difficulty reading small text.

### Visual direction

- Premium, modern, warm, and uncluttered.
- Friendly personality; restrained humor.
- Strong visual hierarchy.
- Large numeric readings.
- Large touch targets, ideally at least 44×44 CSS pixels.
- High contrast and clear focus states.
- Avoid dense dashboards, tiny icons, unnecessary animation, and complex navigation.
- Support portrait orientation gracefully.
- Work in both light and dark modes, or provide a clearly tested single theme with adequate contrast.
- Use semantic icons with text labels where ambiguity is possible.

### Accessibility

Target WCAG 2.2 AA where practical:
- Keyboard navigability.
- Screen-reader labels and logical reading order.
- Visible focus indicators.
- Sufficient contrast.
- Scalable text and layouts.
- Accessible form errors and save confirmations.
- No color-only status communication.
- Reduced-motion support.
- Touch targets suitable for limited dexterity.

Do not make accessibility dependent on optional browser features.

---

## 7. Privacy and security

Use a local-first architecture.

- No account required.
- No analytics, ad networks, tracking pixels, third-party behavioral scripts, or telemetry.
- No remote transmission of health data.
- No backend unless the operator explicitly approves a later requirement.
- Use IndexedDB for structured local data; do not rely on localStorage for the primary measurement database.
- Use a versioned persistence schema and tested migrations.
- Handle storage quota and write failures visibly; never report a save as successful if persistence failed.
- Avoid logging patient readings or notes to the console.
- Do not put health values in URLs, analytics events, or error-reporting payloads.
- Explain local data storage and backup limitations in plain language.
- Use a restrictive Content Security Policy and secure deployment headers where the hosting platform allows.
- Minimize dependencies and review them for maintenance and security.
- Do not request permissions unrelated to the app's function.

The app must not imply that local data is encrypted at rest unless encryption is actually implemented and its key-management limitations are documented. Do not invent security guarantees.

---

## 8. Technical architecture and implementation expectations

Choose a small, well-supported web stack appropriate for a maintainable PWA. TypeScript is preferred. Use a component-based UI and a lightweight build system. Avoid unnecessary backend infrastructure.

The agent must propose and document the final stack before implementation. The architecture should include clear boundaries for:

- UI/presentation.
- Measurement and metric domain model.
- Validation and unit conversion.
- Local persistence and schema migrations.
- Reminder scheduling and missed-reading evaluation.
- Export/import.
- PWA manifest and service worker.

### Engineering requirements

- Strict typing and linting.
- Predictable state management; avoid unnecessary global state.
- Centralized validation and date/time handling.
- Stable IDs for records.
- Versioned storage schema and migrations.
- Deterministic business logic separated from UI.
- No hidden network dependency for core workflows.
- Graceful handling of offline mode and storage errors.
- Reusable components for measurement entry, history rows, metric summaries, and charts.
- Documented assumptions and platform-specific behavior.

Do not over-engineer. Keep the code approachable for one technically capable person to maintain.

---

## 9. Testing and verification

Tests are a deliverable, not an optional extra.

### Unit tests

Cover at least:
- Measurement validation.
- Metric-specific value validation.
- Unit conversion, if supported.
- Threshold evaluation and unconfigured-threshold behavior.
- Date/time formatting and time-zone boundaries.
- Reminder due/missed calculations.
- Duplicate-submit prevention.
- CSV serialization and escaping.
- JSON backup validation and restore/merge behavior.
- Persistence schema migrations.

### Integration tests

Cover:
- Creating, editing, and deleting a glucose reading.
- Saving and retrieving records offline.
- Today/history views reflecting persisted records.
- Metric filtering.
- Reminder configuration and missed-reading display.
- Export and restore round trip.
- Storage failure behavior.
- App startup with an empty database.

### End-to-end tests

Test the main patient workflow on mobile-sized viewports:
1. Launch the app.
2. Log a glucose reading without a note.
3. Verify it appears on Today and History.
4. Edit the reading.
5. Export the data.
6. Configure a reminder.
7. Verify the missed-reading indicator using a controlled test clock or deterministic test fixture.
8. Reload while offline and verify that the app and saved data remain available.

### PWA verification

Verify:
- Manifest parses correctly.
- Icons exist and have correct dimensions.
- Service worker installs and activates.
- Application shell loads offline after the first successful online load.
- Core logging and history work offline.
- No runtime request to a required external service blocks core functionality.
- Standalone display mode and viewport behavior are correct.
- Installation steps are documented separately for Android and iOS.
- Notification limitations are accurately described.

### Quality gates

Before completion:
- Run formatter, linter, type checker, unit tests, integration tests, and end-to-end tests.
- Run a production build.
- Inspect browser console and network errors.
- Test on at least one Android-compatible browser and iOS Safari if device access is available. If physical devices are unavailable, state exactly what was tested in emulation and what remains unverified.
- Run the Superpowers review/completion workflow.
- Fix all critical and high-severity defects.
- Do not suppress failing tests or claim unperformed tests passed.

---

## 10. Required deliverables

The final result must include:

1. Complete application source code.
2. Working local development setup.
3. Production build.
4. PWA manifest, service worker, and app icons.
5. Local persistence implementation with schema versioning.
6. Functional glucose logging, history, charts, reminders/missed indicator, settings, CSV export, and JSON backup/restore.
7. Extensible second-metric architecture.
8. Automated tests and test configuration.
9. `README.md` with exact run, build, deploy, install, backup, and restore instructions.
10. `docs/requirements.md`.
11. `docs/architecture.md`.
12. `docs/implementation-plan.md`.
13. `docs/test-plan.md`.
14. `docs/known-limitations.md`.
15. A concise final implementation report listing completed features, test commands and results, production build location, deployment instructions, and any limitations or unverified device behavior.

The app is not complete if it is only a design, screenshot, static mockup, or non-persistent demo.

---

## 11. Definition of done

The project is complete only when all applicable statements below are true:

- [ ] The app is branded **Sugar Daddy** with the tagline **Your glucose. Your rules.**
- [ ] A non-technical patient can log a glucose reading in under 10 seconds on the common path.
- [ ] Readings persist locally across reloads and offline launches.
- [ ] Today, history, and daily/weekly/monthly trends show actual saved data.
- [ ] Users can edit and delete readings safely.
- [ ] Reminders can be configured and missed readings are visibly identified in-app.
- [ ] Notification limitations are explained honestly for Android and iOS.
- [ ] The second metric can be added through the metric model without redesigning the application.
- [ ] CSV export works and opens as a valid CSV file.
- [ ] JSON backup and restore work, with validation and no silent overwrite.
- [ ] No ads, upsells, analytics, or unnecessary data transmission exist.
- [ ] Medical boundaries and clinician-configured thresholds are respected.
- [ ] Accessibility and mobile usability checks have been performed.
- [ ] PWA manifest, service worker, icons, offline behavior, and installation instructions are verified.
- [ ] Automated tests, lint, type checking, and production build pass.
- [ ] Superpowers workflows were used and their artifacts/results are documented.
- [ ] Known limitations and anything not tested on physical devices are explicitly disclosed.

**Final instruction:** Deliver a polished, genuinely usable, installable PWA—not merely a scaffold. Keep it simple for the patient, technically solid underneath, private by default, and just funny enough to make the name **Sugar Daddy** memorable.
