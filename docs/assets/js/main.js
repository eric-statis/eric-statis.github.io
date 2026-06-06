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
});
