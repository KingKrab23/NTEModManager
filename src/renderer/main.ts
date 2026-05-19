import './styles.css';

import { createApp } from './app';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Expected #app root element to exist.');
}

if (!window.appApi) {
  root.innerHTML = `
    <div class="app-shell">
      <main class="content-panel">
        <section class="surface-card surface-card-lead">
          <p class="section-label">Startup error</p>
          <h2>Preload bridge unavailable</h2>
          <p class="supporting-copy">
            The renderer could not access the Electron preload API. Restart the
            app after rebuilding the main process output.
          </p>
        </section>
      </main>
    </div>
  `;

  throw new Error('Electron preload bridge was not exposed on window.appApi.');
}

createApp(root, window.appApi);
