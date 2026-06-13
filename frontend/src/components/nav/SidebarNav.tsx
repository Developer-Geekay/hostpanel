import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings2, Package, Users, Globe,
  FolderOpen, Terminal, Lock, Database, LogOut, Server,
  Wifi, ArrowLeftRight, HardDrive, ScrollText,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePlugins } from '../../lib/plugins';
import { ThemePicker } from '../ui/ThemePicker';

const iconMap: Record<string, React.ReactNode> = {
  speed:            <LayoutDashboard size={15} strokeWidth={1.5} />,
  settings_suggest: <Settings2      size={15} strokeWidth={1.5} />,
  extension:        <Package        size={15} strokeWidth={1.5} />,
  people:           <Users          size={15} strokeWidth={1.5} />,
  dns:              <Globe          size={15} strokeWidth={1.5} />,
  folder_open:      <FolderOpen     size={15} strokeWidth={1.5} />,
  terminal:         <Terminal       size={15} strokeWidth={1.5} />,
  lock:             <Lock           size={15} strokeWidth={1.5} />,
  storage:          <Database       size={15} strokeWidth={1.5} />,
  vpn_lock:         <Wifi           size={15} strokeWidth={1.5} />,
  web:              <Globe          size={15} strokeWidth={1.5} />,
  swap_horiz:       <ArrowLeftRight size={15} strokeWidth={1.5} />,
  ftp:              <Server         size={15} strokeWidth={1.5} />,
  hard_drive:       <HardDrive      size={15} strokeWidth={1.5} />,
  audit:            <ScrollText     size={15} strokeWidth={1.5} />,
};
const defaultIcon = <Server size={15} strokeWidth={1.5} />;

function Icon({ name }: { name: string }) {
  return <>{iconMap[name] ?? defaultIcon}</>;
}

function SideNavLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <Icon name={icon} />
      {label}
    </NavLink>
  );
}

export function SidebarNav() {
  const { user, isAdmin, logout } = useAuth();
  const { sections } = usePlugins();
  const navigate = useNavigate();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>HostPanel</span>
      </div>

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

      <div className="sidebar-footer">
        <ThemePicker />
        <div className="user-row">
          <div className="user-avatar">{(user?.username?.[0] ?? 'A').toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username}
            </div>
            <div className="user-role">{user?.role}</div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { logout(); navigate('/login'); }}
            title="Log out"
            style={{ padding: '5px', flexShrink: 0 }}
          >
            <LogOut size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </nav>
  );
}
