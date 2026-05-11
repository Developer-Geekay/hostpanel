import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings2, Package, Users, Globe, FolderOpen,
  Terminal, Lock, Database, LogOut, Server, Wifi, ArrowLeftRight, ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { usePluginNav, NavItem } from '../../lib/plugins';
import { ThemePicker } from '../ui/ThemePicker';
import { ReactNode } from 'react';

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
};

function TopLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `topbar-item${isActive ? ' active' : ''}`}>
      {iconMap[icon] ?? <Server size={14} strokeWidth={1.5} />}
      {label}
    </NavLink>
  );
}

function PluginTopLinks({ items, section }: { items: NavItem[]; section: string }) {
  const { isAdmin } = useAuth();
  return (
    <>
      {items.filter(i => i.section === section && (!i.adminOnly || isAdmin))
        .map(i => <TopLink key={i.route} to={`/app/${i.route}`} icon={i.icon} label={i.label} />)}
    </>
  );
}

export function TopbarNav() {
  const { user, isAdmin, logout } = useAuth();
  const pluginNav = usePluginNav();
  const navigate  = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-badge">HP</div>
        <span className="topbar-logo-name">HostPanel</span>
      </div>

      <nav className="topbar-nav" style={{ overflowX: 'auto' }}>
        {isAdmin && (
          <>
            <TopLink to="/app/dashboard" icon="speed"            label="Dashboard" />
            <TopLink to="/app/services"  icon="settings_suggest" label="Services" />
            <TopLink to="/app/packages"  icon="extension"        label="Packages" />
            <TopLink to="/app/users"     icon="people"           label="Users" />
            <TopLink to="/app/dns"       icon="dns"              label="DNS" />
            <TopLink to="/app/domains"   icon="web"              label="Domains" />
            <TopLink to="/app/ftp"       icon="ftp"              label="FTP" />
            <PluginTopLinks items={pluginNav} section="hosting" />
          </>
        )}
        <TopLink to="/app/files"     icon="folder_open" label="Files" />
        <TopLink to="/app/databases" icon="storage"     label="Databases" />
        <TopLink to="/app/redirects" icon="swap_horiz"  label="Redirects" />
        <PluginTopLinks items={pluginNav} section="my_space" />
        {isAdmin && (
          <>
            <TopLink to="/app/ssh" icon="terminal" label="SSH Keys" />
            <TopLink to="/app/ssl" icon="lock"     label="SSL" />
            <PluginTopLinks items={pluginNav} section="security" />
          </>
        )}
      </nav>

      <div className="topbar-end">
        <ThemePicker compact />
        <div style={{ position: 'relative' }}>
          <button className="topbar-user" onClick={() => setUserMenuOpen(v => !v)}>
            <div className="user-avatar" style={{ width: 24, height: 24, fontSize: 11 }}>
              {(user?.username?.[0] ?? 'A').toUpperCase()}
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{user?.username}</span>
            <ChevronDown size={13} color="var(--text-2)" />
          </button>
          {userMenuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 6, minWidth: 160,
            }}>
              <div style={{ padding: '6px 10px 10px', borderBottom: '1px solid var(--border-2)', marginBottom: 4 }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{user?.role}</div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}
                onClick={() => { setUserMenuOpen(false); logout(); navigate('/login'); }}
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
