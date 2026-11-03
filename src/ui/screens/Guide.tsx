import { CARE_TEAM_NOTE, DISCLAIMER } from '../../domain/copy';

/** How to use the app. Deliberately contains no medical guidance. */
export function Guide() {
  return (
    <section aria-labelledby="guide-h">
      <h2 id="guide-h">How to log a reading</h2>
      <ol class="card stack guide-steps">
        <li>
          <strong>Take your reading</strong> the way your care team showed you, and look at the
          number on your meter.
        </li>
        <li>
          Tap <strong>Log glucose</strong> on the Today screen.
        </li>
        <li>
          <strong>Type the number</strong> exactly as your meter shows it. Check the unit (mg/dL or
          mmol/L) matches your meter — tap the other unit if it doesn't.
        </li>
        <li>
          Optional: choose <strong>when</strong> it was taken (for example, Before meal) and add a
          note.
        </li>
        <li>
          If you are logging a reading from earlier, change the <strong>date and time</strong>.
        </li>
        <li>
          Tap <strong>Save</strong>. You'll see a confirmation, and the reading appears on Today and
          in History.
        </li>
      </ol>

      <div class="card stack">
        <h3 style={{ marginTop: 0 }}>Good to know</h3>
        <ul>
          <li>Made a mistake? Open the reading to edit or delete it.</li>
          <li>
            Reminders (in Settings) show a "missed reading" note on Today if a reading wasn't
            logged. Tap "Not needed" if you skipped it on purpose.
          </li>
          <li>
            Your readings stay on this device. Download a backup in Settings now and then, so you
            don't lose them.
          </li>
          <li>Share sends a reading only when you tap it, to the app you choose.</li>
        </ul>
      </div>

      <div class="card stack">
        <p class="disclaimer">{DISCLAIMER}</p>
        <p style={{ margin: 0 }}>{CARE_TEAM_NOTE}</p>
      </div>

      <a class="btn btn-block" href="#/">
        Back to Today
      </a>
    </section>
  );
}
