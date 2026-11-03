import { CARE_TEAM_NOTE, DISCLAIMER, TAGLINE } from '../../domain/copy';

export function About() {
  return (
    <section aria-labelledby="about-h">
      <h2 id="about-h">About Sugar Daddy</h2>
      <div class="card stack">
        <p style={{ margin: 0 }}>
          <strong>{TAGLINE}</strong>
        </p>
        <p class="disclaimer" data-testid="disclaimer">
          {DISCLAIMER}
        </p>
        <p>{CARE_TEAM_NOTE}</p>
      </div>
      <div class="card stack">
        <h3 style={{ marginTop: 0 }}>Privacy</h3>
        <ul>
          <li>No account, no ads, no analytics, no tracking.</li>
          <li>Readings never leave this device unless you export them yourself.</li>
          <li>
            Data is stored in this browser's storage on this device. It is not encrypted by Sugar
            Daddy, and it is not a hospital record.
          </li>
          <li>
            Clearing browser data or removing the app can delete your readings. Download a backup in
            Settings to keep a copy.
          </li>
        </ul>
      </div>
      <div class="card">
        <h3 style={{ marginTop: 0 }}>Version</h3>
        <p class="muted" data-testid="version">
          Version {__APP_VERSION__} · built {new Date(__BUILD_TIME__).toLocaleString()}
        </p>
      </div>
      <a class="btn btn-block" href="#/settings">
        Back to Settings
      </a>
    </section>
  );
}
