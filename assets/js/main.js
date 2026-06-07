document.addEventListener('DOMContentLoaded', () => {
  const navbarBurgers = Array.prototype.slice.call(document.querySelectorAll('.navbar-burger'), 0);

  navbarBurgers.forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.dataset.target;
      const targetEl = document.getElementById(target);
      el.classList.toggle('is-active');
      targetEl.classList.toggle('is-active');
    });
  });

  const notesThemeToggle = document.getElementById('notes-theme-toggle');
  if (notesThemeToggle) {
    notesThemeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      localStorage.setItem('notes-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    });
  }

  const notesTopLink = document.querySelector('.notes-top-link');
  if (notesTopLink) {
    const syncTopLink = () => {
      notesTopLink.classList.toggle('is-visible', window.scrollY > 600);
    };
    syncTopLink();
    window.addEventListener('scroll', syncTopLink, { passive: true });
  }

  const visitorStats = document.querySelector('[data-goatcounter-stats]');
  if (visitorStats) {
    const totalEl = visitorStats.querySelector('[data-visitor-total]');
    const pageEl = visitorStats.querySelector('[data-visitor-page]');
    const noteEl = document.querySelector('[data-visitor-note]');
    const code = window.SITE_GOATCOUNTER_CODE;
    const formatCount = (value) => {
      const count = Number(value);
      return Number.isFinite(count) ? count.toLocaleString() : '--';
    };
    const counterUrl = (path) => `https://${code}.goatcounter.com/counter/${encodeURIComponent(path)}.json`;
    const loadCount = async (path) => {
      const response = await fetch(counterUrl(path), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Counter request failed: ${response.status}`);
      const data = await response.json();
      return data.count;
    };

    if (!code) {
      if (noteEl) noteEl.textContent = 'Live visitor counts appear after GoatCounter is connected.';
      return;
    }

    Promise.allSettled([loadCount('TOTAL'), loadCount(window.location.pathname || '/')]).then((results) => {
      if (results[0].status === 'fulfilled') totalEl.textContent = formatCount(results[0].value);
      if (results[1].status === 'fulfilled') pageEl.textContent = formatCount(results[1].value);
      if (noteEl) {
        const failed = results.some((result) => result.status === 'rejected');
        noteEl.textContent = failed ? 'Visitor counts are warming up.' : 'Live public counters powered by GoatCounter.';
      }
    });
  }
});
