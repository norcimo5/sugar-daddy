import { useApp } from '../context';
import { useInstall } from '../../app/install';
import { Icon } from '../components/Icon';

function IphoneSteps() {
  return (
    <div class="card stack" data-testid="ios-steps">
      <h3 style={{ marginTop: 0 }}>On iPhone or iPad</h3>
      <ol class="guide-steps">
        <li>
          Open this page in <strong>Safari</strong>.
        </li>
        <li>
          Tap the <strong>Share</strong> button (the square with an arrow, at the bottom — or top
          right on iPad).
        </li>
        <li>
          Scroll down and tap <strong>Add to Home Screen</strong>.
        </li>
        <li>
          Tap <strong>Add</strong>. The Sugar Daddy icon appears on your home screen.
        </li>
      </ol>
    </div>
  );
}

function AndroidSteps() {
  return (
    <div class="card stack" data-testid="android-steps">
      <h3 style={{ marginTop: 0 }}>On Android</h3>
      <ol class="guide-steps">
        <li>
          Open this page in <strong>Chrome</strong>.
        </li>
        <li>
          Tap the menu <strong>⋮</strong> (top right).
        </li>
        <li>
          Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
        </li>
        <li>
          Confirm with <strong>Install</strong>.
        </li>
      </ol>
    </div>
  );
}

export function Install() {
  const app = useApp();
  const { mode, promptInstall } = useInstall();

  async function install() {
    if (await promptInstall()) app.toast('Installed. Open Sugar Daddy from your home screen.');
  }

  return (
    <section aria-labelledby="install-h">
      <h2 id="install-h">Install the app</h2>
      {mode === 'installed' ? (
        <div class="card stack">
          <p style={{ margin: 0 }}>
            <strong>Sugar Daddy is installed.</strong> Open it from the icon on your home screen.
          </p>
        </div>
      ) : null}
      {mode === 'prompt' ? (
        <div class="card stack">
          <p style={{ marginTop: 0 }}>
            Put Sugar Daddy on your home screen with one tap. It's free, takes very little space,
            and works without internet.
          </p>
          <button
            type="button"
            class="btn btn-primary btn-xl"
            onClick={install}
            data-testid="install-button"
          >
            <Icon name="plus" />
            Install
          </button>
        </div>
      ) : null}
      {mode === 'ios' ? <IphoneSteps /> : null}
      {mode === 'manual' ? (
        <>
          <AndroidSteps />
          <IphoneSteps />
        </>
      ) : null}
      {mode !== 'installed' ? (
        <p class="hint">
          {mode === 'ios'
            ? 'On iPhone, installing also helps keep your readings: Safari may delete data from websites you have not opened for a while.'
            : 'After installing, open it from the icon — it works even without internet.'}
        </p>
      ) : null}
      <a class="btn btn-block" href="#/">
        Back to Today
      </a>
    </section>
  );
}
