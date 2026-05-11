import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Canvas }  from '@react-three/fiber';
import { useState, useEffect, useRef } from 'react';
import { Suspense } from 'react';
import {
  LayoutDashboard, Settings2, Package, Users, Globe, FolderOpen,
  Terminal, Lock, Database, Server, ArrowLeftRight, LogOut,
  ChevronDown, ChevronUp, Minimize2,
} from 'lucide-react';
import { ServerScene }  from './ServerScene';
import { PanelFX }      from './PanelFX';
import { useAuth }      from '../../lib/auth';
import { useTheme }     from '../../lib/theme';
import { ThemePicker }  from '../ui/ThemePicker';

/* ── Nav node definitions ────────────────────────────────────────────────── */
interface NavNode {
  id: string; label: string; route: string;
  icon: React.ReactNode; sublabel: string;
  x: number; y: number;          /* % from left, % from top of scene area */
  adminOnly?: boolean;
}

const NODES: NavNode[] = [
  { id: 'dashboard', label: 'Dashboard',  sublabel: 'SYS / OVERVIEW',   route: '/app/dashboard', icon: <LayoutDashboard size={16} strokeWidth={1.5} />, x: 50, y: 8,   adminOnly: true  },
  { id: 'services',  label: 'Services',   sublabel: 'SYS / DAEMONS',    route: '/app/services',  icon: <Settings2       size={16} strokeWidth={1.5} />, x: 74, y: 18,  adminOnly: true  },
  { id: 'packages',  label: 'Packages',   sublabel: 'SYS / SOFTWARE',   route: '/app/packages',  icon: <Package         size={16} strokeWidth={1.5} />, x: 26, y: 18,  adminOnly: true  },
  { id: 'users',     label: 'Users',      sublabel: 'HOST / ACCOUNTS',  route: '/app/users',     icon: <Users           size={16} strokeWidth={1.5} />, x: 86, y: 34,  adminOnly: true  },
  { id: 'dns',       label: 'DNS',        sublabel: 'HOST / ZONES',     route: '/app/dns',       icon: <Globe           size={16} strokeWidth={1.5} />, x: 88, y: 52,  adminOnly: true  },
  { id: 'domains',   label: 'Domains',    sublabel: 'HOST / SITES',     route: '/app/domains',   icon: <Globe           size={16} strokeWidth={1.5} />, x: 82, y: 68,  adminOnly: true  },
  { id: 'ftp',       label: 'FTP',        sublabel: 'HOST / TRANSFER',  route: '/app/ftp',       icon: <Server          size={16} strokeWidth={1.5} />, x: 14, y: 68,  adminOnly: true  },
  { id: 'ssh',       label: 'SSH Keys',   sublabel: 'SEC / AUTH',       route: '/app/ssh',       icon: <Terminal        size={16} strokeWidth={1.5} />, x: 12, y: 52,  adminOnly: true  },
  { id: 'ssl',       label: 'SSL',        sublabel: 'SEC / CERTS',      route: '/app/ssl',       icon: <Lock            size={16} strokeWidth={1.5} />, x: 14, y: 34,  adminOnly: true  },
  { id: 'files',     label: 'Files',      sublabel: 'SPACE / FS',       route: '/app/files',     icon: <FolderOpen      size={16} strokeWidth={1.5} />, x: 68, y: 78   },
  { id: 'databases', label: 'Databases',  sublabel: 'SPACE / DB',       route: '/app/databases', icon: <Database        size={16} strokeWidth={1.5} />, x: 50, y: 82   },
  { id: 'redirects', label: 'Redirects',  sublabel: 'SPACE / ROUTES',   route: '/app/redirects', icon: <ArrowLeftRight  size={16} strokeWidth={1.5} />, x: 32, y: 78   },
];

/* ── SVG connection lines ────────────────────────────────────────────────── */
function ConnectionLines({ nodes, activeId }: { nodes: NavNode[]; activeId: string | null }) {
  const cx = 50, cy = 50;   /* server center in SVG coordinate space */

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="0.3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {nodes.map(n => {
        const isActive = n.id === activeId;
        return (
          <g key={n.id}>
            {/* Main line */}
            <line
              x1={cx} y1={cy} x2={n.x} y2={n.y}
              stroke={isActive ? 'rgba(0,212,180,0.6)' : 'rgba(0,212,180,0.12)'}
              strokeWidth={isActive ? 0.25 : 0.15}
              filter={isActive ? 'url(#glow)' : undefined}
              style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
            />
            {/* Travelling dot */}
            <circle r={isActive ? '0.55' : '0.35'} fill={isActive ? '#00d4b4' : 'rgba(0,212,180,0.4)'}
              filter={isActive ? 'url(#glow)' : undefined}
            >
              <animateMotion
                dur={`${2.5 + (n.x * 0.02)}s`}
                repeatCount="indefinite"
                calcMode="linear"
              >
                <mpath href={`#path-${n.id}`} />
              </animateMotion>
            </circle>
            {/* Define path for animateMotion */}
            <path id={`path-${n.id}`} d={`M ${cx},${cy} L ${n.x},${n.y}`} fill="none" stroke="none" />
          </g>
        );
      })}
    </svg>
  );
}

/* ── Single nav node button ──────────────────────────────────────────────── */
function NodeButton({ node, active, onClick }: { node: NavNode; active: boolean; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${node.x}%`,
        top:  `${node.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
        background: active ? 'rgba(0,212,180,0.12)' : 'rgba(2,14,26,0.75)',
        border: `1px solid ${active ? 'rgba(0,212,180,0.8)' : 'rgba(0,212,180,0.25)'}`,
        borderRadius: 0,
        padding: '7px 11px',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        backdropFilter: 'blur(6px)',
        boxShadow: active
          ? '0 0 16px rgba(0,212,180,0.4), 0 0 32px rgba(0,212,180,0.15), inset 0 0 12px rgba(0,212,180,0.06)'
          : '0 0 8px rgba(0,0,0,0.6)',
        transition: 'all 0.2s ease',
        minWidth: 80,
        '--cb': '8px',
      } as React.CSSProperties}
      className="panel-node-btn"
    >
      <span style={{ color: active ? '#00d4b4' : 'rgba(0,212,180,0.5)', display: 'flex',
        filter: active ? 'drop-shadow(0 0 4px #00d4b4)' : 'none', transition: 'all 0.2s' }}>
        {node.icon}
      </span>
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: active ? '#00d4b4' : 'rgba(168,212,232,0.6)',
        textShadow: active ? '0 0 10px rgba(0,212,180,0.7)' : 'none',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}>
        {node.label}
      </span>
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 8,
        color: active ? 'rgba(0,212,180,0.7)' : 'rgba(74,122,150,0.6)',
        letterSpacing: '0.08em',
      }}>
        {node.sublabel}
      </span>
    </button>
  );
}

/* ── Main PanelShell ─────────────────────────────────────────────────────── */
export function PanelShell() {
  const { user, isAdmin, logout } = useAuth();
  const { color }   = useTheme();
  const navigate    = useNavigate();
  const location    = useLocation();
  const [activeId,      setActiveId]      = useState<string | null>(null);
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [drawerMax,     setDrawerMax]     = useState(false);
  const [clock,         setClock]         = useState('');
  const [clickEffect,   setClickEffect]   = useState<string | null>(null);

  /* live clock */
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  /* sync active node with route */
  useEffect(() => {
    const found = NODES.find(n => location.pathname.startsWith(n.route));
    if (found) { setActiveId(found.id); setDrawerOpen(true); }
  }, [location.pathname]);

  const visibleNodes = NODES.filter(n => !n.adminOnly || isAdmin);

  const handleNodeClick = (node: NavNode) => {
    setClickEffect(node.id);
    setTimeout(() => setClickEffect(null), 600);
    setActiveId(node.id);
    setDrawerOpen(true);
    setDrawerMax(false);
    navigate(node.route);
  };

  const drawerH = drawerMax ? '80vh' : '42vh';
  const activeNode = NODES.find(n => n.id === activeId);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#020a12', overflow: 'hidden' }}>

      {/* ── Three.js canvas ────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <Canvas
          camera={{ position: [0, 2.5, 8], fov: 48 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          dpr={[1, 1.5]}
        >
          <Suspense fallback={null}>
            <ServerScene drawerOpen={drawerOpen} />
          </Suspense>
        </Canvas>
      </div>

      {/* ── PanelFX: scan line + CRT + boot ────────────────────────────── */}
      <PanelFX />

      {/* ── Grid background overlay ────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,212,180,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,180,0.025) 1px, transparent 1px)`,
        backgroundSize: '44px 44px',
      }} />

      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 46, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px',
        background: 'rgba(2,10,20,0.92)',
        borderBottom: '1px solid rgba(0,212,180,0.18)',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Left: logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32,
            display: 'grid', placeItems: 'center',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12, fontWeight: 700, color: '#00d4b4',
            letterSpacing: '0.1em',
            background: 'transparent',
            boxShadow: '0 0 14px rgba(0,212,180,0.3)',
            '--cb': '8px',
          } as React.CSSProperties}
            className="panel-hud-badge"
          >HP</div>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', color: '#00d4b4', textShadow: '0 0 12px rgba(0,212,180,0.5)' }}>
              HOSTPANEL
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, letterSpacing: '0.12em', color: 'rgba(74,122,150,0.8)' }}>
              COMMAND SYSTEM v2.0
            </div>
          </div>
        </div>

        {/* Center: clock + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 13, letterSpacing: '0.12em', color: 'rgba(0,212,180,0.8)',
            textShadow: '0 0 10px rgba(0,212,180,0.4)',
          }}>{clock}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5a0', boxShadow: '0 0 6px #00e5a0', animation: 'panel-pulse-ok 2s ease-in-out infinite' }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: '0.1em', color: 'rgba(0,229,160,0.7)' }}>ALL SYSTEMS NOMINAL</span>
          </div>
        </div>

        {/* Right: theme + user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemePicker compact />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', border: '1px solid rgba(0,212,180,0.2)' }}>
            <div style={{
              width: 22, height: 22,
              display: 'grid', placeItems: 'center',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10, fontWeight: 700,
              color: '#00d4b4',
            }}>
              {(user?.username?.[0] ?? 'A').toUpperCase()}
            </div>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(168,212,232,0.8)', letterSpacing: '0.05em' }}>
              {user?.username}
            </span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { logout(); navigate('/login'); }}
            title="Sign out"
            style={{ padding: 5 }}
          >
            <LogOut size={13} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* ── Scene area (topbar to drawer) ─────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 46, left: 0, right: 0,
        bottom: drawerOpen ? drawerH : 0,
        zIndex: 8,
        transition: 'bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {/* Connection SVG */}
        <ConnectionLines nodes={visibleNodes} activeId={activeId} />

        {/* Nav nodes */}
        {visibleNodes.map(node => (
          <NodeButton
            key={node.id}
            node={node}
            active={activeId === node.id}
            onClick={() => handleNodeClick(node)}
          />
        ))}

        {/* Center server label */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -90px)',
          zIndex: 12, pointerEvents: 'none', textAlign: 'center',
        }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(0,212,180,0.5)', textTransform: 'uppercase' }}>
            ◈ SERVER NODE
          </div>
        </div>
      </div>

      {/* ── Content Drawer ─────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: drawerOpen ? drawerH : '44px',
        zIndex: 15,
        background: 'rgba(2, 10, 20, 0.96)',
        borderTop: '1px solid rgba(0,212,180,0.25)',
        backdropFilter: 'blur(16px)',
        transition: 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.8), 0 -1px 0 rgba(0,212,180,0.1)',
      }}>
        {/* Drawer tab bar */}
        <div style={{
          height: 44, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px',
          borderBottom: drawerOpen ? '1px solid rgba(0,212,180,0.12)' : 'none',
          cursor: 'pointer',
          position: 'relative',
        }}
          onClick={() => setDrawerOpen(v => !v)}
        >
          {/* Accent line at top of drawer */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(0,212,180,0.6) 30%, rgba(0,212,180,0.6) 70%, transparent)',
          }} />

          {drawerOpen
            ? <ChevronDown size={13} strokeWidth={1.5} color="rgba(0,212,180,0.7)" />
            : <ChevronUp   size={13} strokeWidth={1.5} color="rgba(0,212,180,0.7)" />
          }

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            {activeNode && (
              <span style={{ color: 'rgba(0,212,180,0.6)', display: 'flex' }}>
                {activeNode.icon}
              </span>
            )}
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5, letterSpacing: '0.15em', textTransform: 'uppercase',
              color: drawerOpen ? 'rgba(0,212,180,0.9)' : 'rgba(74,122,150,0.7)',
            }}>
              {activeNode ? `> ${activeNode.label}` : '> SELECT A MODULE'}
            </span>
            {activeNode && (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: 'rgba(74,122,150,0.6)', letterSpacing: '0.1em' }}>
                [{activeNode.sublabel}]
              </span>
            )}
          </div>

          {drawerOpen && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button
                onClick={e => { e.stopPropagation(); setDrawerMax(v => !v); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(0,212,180,0.5)' }}
                title={drawerMax ? 'Restore' : 'Maximize'}
              >
                <Minimize2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        {/* Content area */}
        {drawerOpen && (
          <div style={{
            flex: 1, overflow: 'hidden auto',
            position: 'relative',
          }}>
            <Outlet />
          </div>
        )}
      </div>
    </div>
  );
}
