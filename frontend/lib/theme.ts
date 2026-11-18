export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'photo-cloud-theme';
const THEME_CHANGED = 'photo-cloud-theme-changed';

// Runs in <head> before paint; it contains no user input or private data.
export const themeInitializationScript = `(() => {
  let preference = null;
  try { const saved = localStorage.getItem('${THEME_STORAGE_KEY}'); if (saved === 'light' || saved === 'dark') preference = saved; } catch {}
  const root = document.documentElement;
  root.dataset.theme = preference || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.dataset.themePreference = preference ? 'manual' : 'system';
})();`;

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function getServerTheme(): null {
  return null;
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = 'manual';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Keep this tab usable without storage. */
  }
  window.dispatchEvent(new Event(THEME_CHANGED));
}

export function subscribeToTheme(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function followSystem() {
    if (document.documentElement.dataset.themePreference !== 'manual') {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
      onChange();
    }
  }
  function syncStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea !== localStorage) return;
    } catch {
      return;
    }
    const preference =
      event.key === THEME_STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')
        ? event.newValue
        : null;
    document.documentElement.dataset.themePreference = preference ? 'manual' : 'system';
    document.documentElement.dataset.theme = preference ?? (media.matches ? 'dark' : 'light');
    onChange();
  }
  window.addEventListener(THEME_CHANGED, onChange);
  window.addEventListener('storage', syncStorage);
  media.addEventListener('change', followSystem);
  return () => {
    window.removeEventListener(THEME_CHANGED, onChange);
    window.removeEventListener('storage', syncStorage);
    media.removeEventListener('change', followSystem);
  };
}
