import type { Router } from 'vue-router';

/** Move focus to main heading after navigation (WCAG focus management). */
export function installRouteFocus(router: Router): void {
  router.afterEach(() => {
    requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      const heading = main?.querySelector('h1');
      if (heading instanceof HTMLElement) {
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading.focus({ preventScroll: false });
        return;
      }
      if (main instanceof HTMLElement) {
        main.focus({ preventScroll: false });
      }
    });
  });
}
