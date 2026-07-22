(() => {
  const screens = [...document.querySelectorAll('[data-screen]')];
  const stepButtons = [...document.querySelectorAll('[data-step]')];

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function currentStep() {
    const active = document.querySelector('[data-screen].is-active');
    return Number(active?.dataset.screen || 1);
  }

  function showStep(nextStep, updateHash = true) {
    const step = clamp(Number(nextStep) || 1, 1, screens.length || 3);

    screens.forEach((screen) => {
      const active = Number(screen.dataset.screen) === step;
      screen.classList.toggle('is-active', active);
      screen.toggleAttribute('inert', !active);
      screen.setAttribute('aria-hidden', String(!active));
    });

    stepButtons.forEach((button) => {
      const active = Number(button.dataset.step) === step;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'step' : 'false');
    });

    document.documentElement.style.setProperty('--journey-progress', `${((step - 1) / 2) * 100}%`);
    document.body.dataset.currentStep = String(step);

    if (updateHash) history.replaceState(null, '', `#step-${step}`);
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  document.addEventListener('click', (event) => {
    const stepButton = event.target.closest('[data-step]');
    if (stepButton) showStep(stepButton.dataset.step);

    const next = event.target.closest('[data-next]');
    if (next) showStep(currentStep() + 1);

    const previous = event.target.closest('[data-prev]');
    if (previous) showStep(currentStep() - 1);

    const action = event.target.closest('[data-action]');
    if (action) {
      const card = action.closest('[data-action-card]');
      if (!card) return;
      const improved = card.classList.toggle('is-improved');
      action.setAttribute('aria-pressed', String(improved));
      const idle = action.dataset.idle || 'Improve It';
      const done = action.dataset.done || 'Improved';
      const label = action.querySelector('[data-action-label]');
      if (label) label.textContent = improved ? done : idle;
      const status = card.querySelector('[data-action-status]');
      if (status) status.textContent = improved ? 'Ready' : 'High impact';
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    if (event.key === 'ArrowRight') showStep(currentStep() + 1);
    if (event.key === 'ArrowLeft') showStep(currentStep() - 1);
  });

  document.querySelectorAll('[data-compare]').forEach((compare) => {
    const range = compare.querySelector('input[type="range"]');
    if (!range) return;
    const update = () => compare.style.setProperty('--split', `${range.value}%`);
    range.addEventListener('input', update);
    update();
  });

  document.querySelectorAll('[data-do-all]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-action-card]').forEach((card, index) => {
        window.setTimeout(() => {
          card.classList.add('is-improved');
          const action = card.querySelector('[data-action]');
          if (action) {
            action.setAttribute('aria-pressed', 'true');
            const label = action.querySelector('[data-action-label]');
            if (label) label.textContent = action.dataset.done || 'Improved';
          }
          const status = card.querySelector('[data-action-status]');
          if (status) status.textContent = 'Ready';
        }, index * 90);
      });
      button.classList.add('is-done');
      const label = button.querySelector('[data-all-label]');
      if (label) label.textContent = 'Your new page is ready';
    });
  });

  const hashStep = Number(location.hash.replace('#step-', ''));
  showStep(hashStep >= 1 && hashStep <= 3 ? hashStep : 1, false);
})();
