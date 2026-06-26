import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings2, Package, Users, Globe,
  FolderOpen, Terminal, Lock, Database, LogOut, Server,
  Wifi, ArrowLeftRight, HardDrive, ScrollText, Mail, Search,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePlugins } from '../../lib/plugins';
import { ThemePicker } from '../ui/ThemePicker';

const iconMap: Record<string, React.ReactNode> = {
  speed:            <LayoutDashboard size={14} strokeWidth={1.5} />,
  settings_suggest: <Settings2      size={14} strokeWidth={1.5} />,
  extension:        <Package        size={14} strokeWidth={1.5} />,
  people:           <Users          size={14} strokeWidth={1.5} />,
  dns:              <Globe          size={14} strokeWidth={1.5} />,
  folder_open:      <FolderOpen     size={14} strokeWidth={1.5} />,
  terminal:         <Terminal       size={14} strokeWidth={1.5} />,
  lock:             <Lock           size={14} strokeWidth={1.5} />,
  storage:          <Database       size={14} strokeWidth={1.5} />,
  vpn_lock:         <Wifi           size={14} strokeWidth={1.5} />,
  web:              <Globe          size={14} strokeWidth={1.5} />,
  swap_horiz:       <ArrowLeftRight size={14} strokeWidth={1.5} />,
  ftp:              <Server         size={14} strokeWidth={1.5} />,
  hard_drive:       <HardDrive      size={14} strokeWidth={1.5} />,
  audit:            <ScrollText     size={14} strokeWidth={1.5} />,
  mail:             <Mail           size={14} strokeWidth={1.5} />,
};
const defaultIcon = <Server size={14} strokeWidth={1.5} />;

function Icon({ name }: { name: string }) {
  return <>{iconMap[name] ?? defaultIcon}</>;
}

function SideNavLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <span className="ni" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} />
      </span>
      {label}
    </NavLink>
  );
}

export function SidebarNav() {
  const { user, isAdmin, logout } = useAuth();
  const { sections } = usePlugins();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      {/* Sidebar Header / Logo Section */}
      <div className="sidebar-logo">
        <div className="logo-badge">
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>HP</span>
        </div>
        <div>
          <div className="logo-name" style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            HostPanel
          </div>
          <div className="logo-ver" style={{ fontSize: '9px', color: 'var(--text-3)' }}>
            v2.4.1 · {user?.username || 'root'}
          </div>
        </div>
        <ThemePicker />
      </div>

      {/* Sidebar Navigation Body */}
      <div className="nav-body">
        {sections
          .filter(s => !s.adminOnly || isAdmin)
          .map(section => (
            <div key={section.key}>
              <div className="nav-section">{section.label}</div>
              {section.items
                .filter(item => !item.adminOnly || isAdmin)
                .map(item => (
                  <SideNavLink
                    key={item.route}
                    to={`/app/${item.route}`}
                    icon={item.icon}
                    label={item.label}
                  />
                ))}
            </div>
          ))}
      </div>

      {/* Sidebar Footer / User Profile Section */}
      <div className="sidebar-footer">
        <div className="user-row" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
          <div className="avatar" style={{
            width: '26px', height: '26px', borderRadius: '6px',
            background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--accent-fg, var(--accent))',
            flexShrink: 0
          }}>
            {(user?.username?.[0] ?? 'A').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
              {user?.username}
            </div>
            <div className="mono" style={{ fontSize: '9.5px', color: 'var(--text-3)' }}>
              {user?.role || 'Administrator'} · active
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { logout(); navigate('/login'); }}
            title="Log out"
            style={{ padding: '5px', flexShrink: 0, border: 'none', background: 'none' }}
          >
            <LogOut size={13} strokeWidth={1.5} color="var(--text-3)" />
          </button>
        </div>
      </div>
    </aside>
  );
}
