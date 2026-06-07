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
});
