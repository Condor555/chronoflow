export const HOME_MODES = Object.freeze({
  office: { label: 'Ufficio', cardLabel: 'Ufficio', icon: '▥' },
  smart: { label: 'Smart working', cardLabel: 'Casa · Smart Working', icon: '⌂' },
  travel: { label: 'Trasferta', cardLabel: 'Trasferta', icon: '↗' }
});

export function applyHomeMode(root, mode) {
  const selected = HOME_MODES[mode] ? mode : 'office';
  const meta = HOME_MODES[selected];
  const pill = root.querySelector('[data-role="mode-pill"]');
  const card = root.querySelector('[data-role="timer-card"]');
  if (!pill || !card) throw new Error('Pill o card timer non trovata.');

  for (const element of [pill, card]) {
    element.dataset.mode = selected;
    element.classList.remove('mode-office', 'mode-smart', 'mode-travel');
    element.classList.add(`mode-${selected}`);
  }
  pill.textContent = meta.label;
  card.querySelector('[data-role="timer-mode-label"]')?.replaceChildren(document.createTextNode(`${meta.icon}  ${meta.cardLabel}`));
  root.querySelectorAll('[data-home-mode]').forEach((button) => {
    const active = button.dataset.homeMode === selected;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('active', active);
  });
  return selected;
}

export function initHomeModePicker(root, initialMode = 'office') {
  const handler = (event) => {
    const button = event.target.closest('[data-home-mode]');
    if (button) applyHomeMode(root, button.dataset.homeMode);
  };
  root.addEventListener('click', handler);
  applyHomeMode(root, initialMode);
  return () => root.removeEventListener('click', handler);
}
