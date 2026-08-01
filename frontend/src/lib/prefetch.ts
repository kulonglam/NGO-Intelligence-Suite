import type { Router, RouteLocationRaw } from 'vue-router';

type NetworkInformationLike = {
  saveData?: boolean;
  metered?: boolean;
  effectiveType?: string;
};

/** SDD §19.8.1 — prefetch only when not metered and not 2g. Unknown → allow. */
export function connectionAllowsPrefetch(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  if (conn.metered) return false;
  const type = (conn.effectiveType ?? '').toLowerCase();
  if (type === '2g' || type === 'slow-2g') return false;
  return true;
}

type LazyComponent = () => Promise<unknown>;

function isLazy(comp: unknown): comp is LazyComponent {
  return typeof comp === 'function';
}

/** Warm the lazy chunk for a route on hover/focus intent. */
export function prefetchRoute(router: Router, to: RouteLocationRaw): void {
  if (!connectionAllowsPrefetch()) return;
  try {
    const resolved = router.resolve(to);
    for (const record of resolved.matched) {
      const comps = record.components;
      if (!comps) continue;
      for (const comp of Object.values(comps)) {
        if (isLazy(comp)) void comp().catch(() => undefined);
      }
    }
  } catch {
    /* ignore resolve errors */
  }
}
