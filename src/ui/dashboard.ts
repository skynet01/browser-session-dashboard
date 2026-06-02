import './dashboard.css';

const app = document.querySelector<HTMLElement>('#app');

if (app) {
  app.innerHTML = `
    <section class="empty-state" aria-labelledby="dashboard-title">
      <p class="eyebrow">Local exposure inventory</p>
      <h1 id="dashboard-title">Browser Session Compromise Dashboard</h1>
      <p>
        These are the browser sessions/sites currently present and likely exposed if this browser
        profile's cookies were stolen.
      </p>
      <button type="button">Scan browser profile</button>
    </section>
  `;
}
