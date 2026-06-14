import { useState, useEffect, useRef } from 'react';
import { Server } from 'lucide-react';
import { apiGet } from '../../../lib/api';
import type { DashboardBlock } from '../../../lib/plugins';

interface PkgApi {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
  raw(method: string, path: string): Promise<Response>;
}

function buildPkgApi(slug: string): PkgApi {
  const base = `/cpanelapi/${slug}`;
  const auth = () => `Bearer ${localStorage.getItem('auth_token') ?? ''}`;
  return {
    async get(path)        { const r = await fetch(`${base}/${path}`, { headers: { Authorization: auth() } }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
    async post(path, body) { const r = await fetch(`${base}/${path}`, { method: 'POST', headers: { Authorization: auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
    async delete(path)     { const r = await fetch(`${base}/${path}`, { method: 'DELETE', headers: { Authorization: auth() } }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
    raw: (method, path)    => fetch(`${base}/${path}`, { method, headers: { Authorization: auth() } }),
  };
}

interface StatResponse { count?: number; value?: string; label?: string; }

function StatBlock({ block }: { block: DashboardBlock }) {
  const [data, setData] = useState<StatResponse | null>(null);
  const [err, setErr]   = useState('');

  useEffect(() => {
    if (!block.endpoint) { setErr('No endpoint'); return; }
    apiGet<StatResponse>(block.endpoint)
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Error'));
  }, [block.endpoint]);

  const displayValue = data
    ? (data.count !== undefined ? String(data.count) : data.value ?? '—')
    : err ? '!' : '…';

  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="stat-label">{block.label}</span>
        <span style={{ color: 'var(--text-3)' }}><Server size={15} strokeWidth={1.5} /></span>
      </div>
      <div className="stat-value" style={err ? { color: 'var(--err)', fontSize: 14 } : {}}>{displayValue}</div>
      <div className="stat-sub">{err || data?.label || block.label}</div>
    </div>
  );
}

function WidgetBlock({ block }: { block: DashboardBlock }) {
  const elRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!elRef.current) return;
    const el  = elRef.current;
    const api = buildPkgApi(block.slug);

    const init = () => {
      const pkg = window.__hpkg?.[block.slug];
      if (pkg?.dashboard) { pkg.dashboard(el, api); }
      else { setErr(`Package "${block.slug}" has no dashboard() export`); }
    };

    if (window.__hpkg?.[block.slug]) { init(); return; }

    const script    = document.createElement('script');
    script.src      = `/packages/${block.slug}/main.js`;
    script.onload   = init;
    script.onerror  = () => setErr(`/packages/${block.slug}/main.js not found`);
    document.head.appendChild(script);

    return () => { window.__hpkg?.[block.slug]?.destroy?.(); el.replaceChildren(); };
  }, [block.slug]);

  return (
    <div className="stat-card" style={block.size === 'lg' ? { gridColumn: '1/-1' } : {}}>
      {err
        ? <><div className="stat-label">{block.label}</div><div className="stat-sub" style={{ color: 'var(--err)', marginTop: 8 }}>{err}</div></>
        : <div ref={elRef} style={{ minHeight: 60 }} />
      }
    </div>
  );
}

interface Props { blocks: DashboardBlock[]; }

export function DashboardBlocks({ blocks }: Props) {
  const smBlocks = blocks.filter(b => b.size !== 'lg');
  const lgBlocks = blocks.filter(b => b.size === 'lg');

  const renderBlock = (block: DashboardBlock) =>
    block.type === 'stat'
      ? <StatBlock key={`${block.slug}-${block.label}`} block={block} />
      : <WidgetBlock key={`${block.slug}-${block.label}`} block={block} />;

  return (
    <div>
      <div className="page-header" style={{ marginTop: 28 }}>
        <div className="page-title" style={{ fontSize: 14 }}>Packages</div>
      </div>
      {smBlocks.length > 0 && <div className="grid-3" style={{ marginBottom: 16 }}>{smBlocks.map(renderBlock)}</div>}
      {lgBlocks.map(renderBlock)}
    </div>
  );
}
