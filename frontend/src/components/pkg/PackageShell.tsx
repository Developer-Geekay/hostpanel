import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

declare global {
  interface Window {
    __hpkg?: Record<string, {
      init(el: HTMLElement, api: PkgApi): void;
      destroy?(): void;
    }>;
  }
}

interface PkgApi {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
  raw(method: string, path: string): Promise<Response>;
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
      const r = await fetch(`${base}/${path}`, { method: 'POST', headers: { Authorization: auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw Object.assign(new Error(await r.text()), { status: r.status });
      return r.json();
    },
    async delete(path) {
      const r = await fetch(`${base}/${path}`, { method: 'DELETE', headers: { Authorization: auth() } });
      if (!r.ok) throw Object.assign(new Error(await r.text()), { status: r.status });
      return r.json();
    },
    raw: (method, path) => fetch(`${base}/${path}`, { method, headers: { Authorization: auth() } }),
  };
}

export function PackageShell() {
  const { slug } = useParams<{ slug: string }>();
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug || !hostRef.current) return;
    const el = hostRef.current;
    const api = buildApi(slug);

    const init = () => {
      const pkg = window.__hpkg?.[slug];
      if (pkg) { pkg.init(el, api); }
      else { setError(`Package "${slug}" did not register window.__hpkg['${slug}']`); }
    };

    if (window.__hpkg?.[slug]) { init(); return; }

    const script = document.createElement('script');
    script.src = `/packages/${slug}/main.js`;
    script.onload = init;
    script.onerror = () => setError(`/packages/${slug}/main.js not found`);
    document.head.appendChild(script);

    return () => {
      window.__hpkg?.[slug]?.destroy?.();
      el.replaceChildren();
    };
  }, [slug]);

  return (
    <div ref={hostRef} style={{ height: '100%' }}>
      {error && (
        <div className="empty" style={{ height: '100%' }}>
          <div className="empty-title">Plugin load failed</div>
          <div className="empty-desc" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{error}</div>
        </div>
      )}
    </div>
  );
}
