import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings2, Package, Users, Globe, FolderOpen,
  Terminal, Lock, Database, LogOut, Server, Wifi, ArrowLeftRight,
  ChevronDown, Shield,
} from 'lucide-react';
import { useState, useRef, useEffect, ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { usePluginNav } from '../../lib/plugins';
import { ThemePicker } from '../ui/ThemePicker';

const iconMap: Record<string, ReactNode> = {
  speed:            <LayoutDashboard size={14} strokeWidth={1.5} />,
  settings_suggest: <Settings2 size={14} strokeWidth={1.5} />,
  extension:        <Package size={14} strokeWidth={1.5} />,
  people:           <Users size={14} strokeWidth={1.5} />,
  dns:              <Globe size={14} strokeWidth={1.5} />,
  folder_open:      <FolderOpen size={14} strokeWidth={1.5} />,
  terminal:         <Terminal size={14} strokeWidth={1.5} />,
  lock:             <Lock size={14} strokeWidth={1.5} />,
  storage:          <Database size={14} strokeWidth={1.5} />,
  vpn_lock:         <Wifi size={14} strokeWidth={1.5} />,
  web:              <Globe size={14} strokeWidth={1.5} />,
  swap_horiz:       <ArrowLeftRight size={14} strokeWidth={1.5} />,
  ftp:              <Server size={14} strokeWidth={1.5} />,
  shield:           <Shield size={14} strokeWidth={1.5} />,
};
const defaultIcon = <Server size={14} strokeWidth={1.5} />;

interface DropItem { to: string; icon: string; label: string; }

function NavDropdown({ label, items }: { label: string; items: DropItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!items.length) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`topbar-item${open ? ' active' : ''}`}
        onClick={() => setOpen(v => !v)}
        style={{ gap: 5 }}
      >
        {label}
        <ChevronDown size={11} strokeWidth={2}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', opacity: 0.6 }} />
      </button>
      {open && (
        <div className="animate-fade-in" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300,
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 5, minWidth: 170,
          boxShadow: 'var(--shadow-md)',
        }}>
          {items.map(item => (
            <NavLink
              key={item.to} to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => isActive ? 'topbar-drop-item topbar-drop-item-active' : 'topbar-drop-item'}
            >
              <span style={{ color: 'var(--text-3)', display: 'flex', flexShrink: 0 }}>
                {iconMap[item.icon] ?? defaultIcon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopbarNav() {
  const { user, isAdmin, logout } = useAuth();
  const pluginNav = usePluginNav();
  const navigate  = useNavigate();
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pluginItems = (section: string): DropItem[] =>
    pluginNav
      .filter(i => i.section === section && (!i.adminOnly || isAdmin))
      .map(i => ({ to: `/app/${i.route}`, icon: i.icon, label: i.label }));

  const systemItems: DropItem[] = isAdmin ? [
    { to: '/app/dashboard', icon: 'speed',            label: 'Dashboard' },
    { to: '/app/services',  icon: 'settings_suggest', label: 'Services' },
    { to: '/app/packages',  icon: 'extension',        label: 'Packages' },
  ] : [];

  const hostingItems: DropItem[] = isAdmin ? [
    { to: '/app/users',   icon: 'people', label: 'Users' },
    { to: '/app/dns',     icon: 'dns',    label: 'DNS' },
    { to: '/app/domains', icon: 'web',    label: 'Domains' },
    { to: '/app/ftp',     icon: 'ftp',    label: 'FTP' },
    ...pluginItems('hosting'),
  ] : [];

  const mySpaceItems: DropItem[] = [
    { to: '/app/files',     icon: 'folder_open', label: 'Files' },
    { to: '/app/databases', icon: 'storage',     label: 'Databases' },
    { to: '/app/redirects', icon: 'swap_horiz',  label: 'Redirects' },
    ...pluginItems('my_space'),
  ];

  const securityItems: DropItem[] = isAdmin ? [
    { to: '/app/ssh', icon: 'terminal', label: 'SSH Keys' },
    { to: '/app/ssl', icon: 'lock',     label: 'SSL' },
    ...pluginItems('security'),
  ] : [];

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>HostPanel</span>
      </div>

      <nav className="topbar-nav">
        <NavDropdown label="System"   items={systemItems} />
        <NavDropdown label="Hosting"  items={hostingItems} />
        <NavDropdown label="My Space" items={mySpaceItems} />
        <NavDropdown label="Security" items={securityItems} />
      </nav>

      <div className="topbar-end">
        <ThemePicker compact />
        <div ref={userRef} style={{ position: 'relative' }}>
          <button className="topbar-user" onClick={() => setUserOpen(v => !v)}>
            <div className="user-avatar" style={{ width: 24, height: 24, fontSize: 11 }}>
              {(user?.username?.[0] ?? 'A').toUpperCase()}
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{user?.username}</span>
            <ChevronDown size={12} strokeWidth={2} color="var(--text-2)" />
          </button>
          {userOpen && (
            <div className="animate-fade-in" style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 6, minWidth: 160,
              boxShadow: 'var(--shadow-md)',
            }}>
              <div style={{ padding: '4px 10px 8px', borderBottom: '1px solid var(--border-2)', marginBottom: 4 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>{user?.username}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{user?.role}</div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}
                onClick={() => { setUserOpen(false); logout(); navigate('/login'); }}
              >
                <LogOut size={13} strokeWidth={1.5} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
