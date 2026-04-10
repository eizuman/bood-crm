// Bood CRM — Theme Management

export const THEMES = {
  default: 'Стандартная',
  craft:   'Craft',
};

export function getTheme() {
  return localStorage.getItem('bood-theme') || 'default';
}

export function applyTheme(theme) {
  document.body.classList.forEach(cls => {
    if (cls.startsWith('theme-')) document.body.classList.remove(cls);
  });
  if (theme && theme !== 'default') {
    document.body.classList.add(`theme-${theme}`);
  }
  localStorage.setItem('bood-theme', theme);
}

// Call once on page load (before any rendering) to avoid flash
export function initTheme() {
  applyTheme(getTheme());
}
