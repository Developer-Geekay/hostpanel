import { useEffect, useRef, useState, ComponentType } from 'react';
import { useParams } from 'react-router-dom';

// PkgApi type — passed to old-style plugins for backward compat
interface PkgApi {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
  raw(method: string, path: string): Promise<Response>;
}

declare global {
  interface Window {
    __hpkg?: Record<string, {
      init?(el: HTMLElement, api: PkgApi): void;
      dashboard?(el: HTMLElement, api: PkgApi): void;
      destroy?(): void;
    }>;
  }
}

function buildApi(slug: string): PkgApi {
  const base = `/cpanelapi/${slug}`;
  const auth = () => `Bearer ${localStorage.getItem('auth_token') ?? ''}`;
  return {
    async get(path) {
      const r = await fetch(`${base}/${path}`, { headers: { Authorization: auth() } });
      if (!r.ok) throw Object.assign(new Error(await r.text()), { status: r.status });
      return r.json();
    },
    async post(path, body) {
      const r = await fetch(`${base}/${path}`, {
        method: 'POST',
        headers: { Authorization: auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Object.assign(new Error(await r.text()), { status: r.status });
      return r.json();
    },
    async delete(path) {
      const r = await fetch(`${base}/${path}`, {
        method: 'DELETE', headers: { Authorization: auth() },
      });
      if (!r.ok) throw Object.assign(new Error(await r.text()), { status: r.status });
      return r.json();
    },
    raw: (method, path) =>
      fetch(`${base}/${path}`, { method, headers: { Authorization: auth() } }),
  };
}

export function PackageShell() {
  const { slug } = useParams<{ slug: string }>();
  const hostRef  = useRef<HTMLDivElement>(null);
  const apiRef   = useRef<PkgApi | null>(null);
  const [error,    setError]   = useState('');
  const [SdkComp, setSdkComp] = useState<ComponentType<{ api: PkgApi }> | null>(null);

  useEffect(() => {
    if (!slug) return;
    setError('');

    // Build api once per slug
    apiRef.current = buildApi(slug);
    const api = apiRef.current;

    const init = () => {
      // ── SDK path (new plugins) ───────────────────────────────────────────────────
      const Comp = window.__hpkg_sdk?._registry.get(slug);
      if (Comp) {
        setSdkComp(() => Comp as ComponentType<{ api: PkgApi }>);
        return;
      }
      // ── Legacy path (old compiled IIFE plugins — WireGuard etc.) ─────────────────
      const pkg = window.__hpkg?.[slug];
      if (pkg?.init && hostRef.current) {
        pkg.init(hostRef.current, api);
        return;
      }
      setError(`Package "${slug}" did not register a plugin`);
    };

    // Fix 1: Check registry BEFORE clearing SdkComp — zero flash on back-nav
    if (window.__hpkg_sdk?._registry.has(slug) || window.__hpkg?.[slug]) {
      init();
      return;
    }

    // Not loaded yet — clear stale comp and load script
    setSdkComp(null);

    const script = document.createElement('script');
    // Fix 2: Stable session cache key — re-download only when plugin is updated,
    // not on every navigation. Key is stored per-slug in sessionStorage and
    // bumped by the Packages screen after a successful install/update.
    const cacheKey = sessionStorage.getItem(`hp_pkg_v_${slug}`) ?? '1';
    script.src    = `/packages/${slug}/main.js?v=${cacheKey}`;
    script.onload = init;
    script.onerror = () => setError(`/packages/${slug}/main.js not found`);
    document.head.appendChild(script);

    return () => {
      // Fix 3: Don’t null SdkComp when registry already has it — instant re-render
      if (!window.__hpkg_sdk?._registry.has(slug)) {
        setSdkComp(null);
      }
      setError('');
      window.__hpkg?.[slug]?.destroy?.();
      hostRef.current?.replaceChildren();
    };
  }, [slug]);

  // SDK plugin: render as a proper React component (gets theme, context, etc.)
  if (SdkComp && apiRef.current) {
    return <SdkComp api={apiRef.current} />;
  }

  // Legacy or error
  return (
    <div ref={hostRef} style={{ height: '100%' }}>
      {error && (
        <div className="empty" style={{ height: '100%' }}>
          <div className="empty-title">Plugin load failed</div>
          <div className="empty-desc" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
