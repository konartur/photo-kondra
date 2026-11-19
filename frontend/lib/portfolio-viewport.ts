// Set the initial mobile viewport dimensions before the body is painted.
export const portfolioViewportInitializationScript = `(() => {
  if (!matchMedia('(max-width: 760px) and (pointer: coarse)').matches) return;
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  const bottom = Math.ceil((viewport ? viewport.offsetTop : 0) + height);
  const root = document.documentElement;
  root.style.setProperty('--portfolio-visible-height', Math.ceil(height) + 'px');
  root.style.setProperty('--portfolio-hero-height', Math.ceil(height) + 'px');
  root.style.setProperty('--portfolio-photo-height', Math.max(window.screen.height, window.innerHeight, bottom) + 'px');
})();`;
