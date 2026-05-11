import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings2, Package, Users, Globe, FolderOpen,
  Terminal, Lock, Database, LogOut, Server, Wifi, ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePluginNav, NavItem } from '../../lib/plugins';
import { ThemePicker } from '../ui/ThemePicker';

const iconMap: Record<string, React.ReactNode> = {
  speed:           <LayoutDashboard size={15} strokeWidth={1.5} />,
  settings_suggest:<Settings2 size={15} strokeWidth={1.5} />,
  extension:       <Package size={15} strokeWidth={1.5} />,
  people:          <Users size={15} strokeWidth={1.5} />,
  dns:             <Globe size={15} strokeWidth={1.5} />,
  folder_open:     <FolderOpen size={15} strokeWidth={1.5} />,
  terminal:        <Terminal size={15} strokeWidth={1.5} />,
  lock:            <Lock size={15} strokeWidth={1.5} />,
  storage:         <Database size={15} strokeWidth={1.5} />,
  vpn_lock:        <Wifi size={15} strokeWidth={1.5} />,
  web:             <Globe size={15} strokeWidth={1.5} />,
  swap_horiz:      <ArrowLeftRight size={15} strokeWidth={1.5} />,
  ftp:             <Server size={15} strokeWidth={1.5} />,
};
const defaultIcon = <Server size={15} strokeWidth={1.5} />;
function Icon({ name }: { name: string }) { return <>{iconMap[name] ?? defaultIcon}</>; }

function SideNavLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <Icon name={icon} />
      {label}
    </NavLink>
  );
}

function PluginLinks({ items, section }: { items: NavItem[]; section: string }) {
  const { isAdmin } = useAuth();
  return (
    <>
      {items
        .filter(i => i.section === section && (!i.adminOnly || isAdmin))
        .map(i => (
          <SideNavLink key={i.route} to={`/app/${i.route}`} icon={i.icon} label={i.label} />
        ))}
    </>
  );
}

export function SidebarNav() {
  const { user, isAdmin, logout } = useAuth();
  const pluginNav = usePluginNav();
  const navigate  = useNavigate();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-badge">HP</div>
        <div>
          <div className="logo-name">HostPanel</div>
          <div className="logo-ver">v2.0</div>
        </div>
      </div>

      <div className="nav-body">
        {isAdmin && (
          <>
            <div className="nav-section">System</div>
            <SideNavLink to="/app/dashboard" icon="speed"            label="Dashboard" />
            <SideNavLink to="/app/services"  icon="settings_suggest" label="Services" />
            <SideNavLink to="/app/packages"  icon="extension"        label="Packages" />
          </>
        )}

        {isAdmin && (
          <>
            <div className="nav-section">Hosting</div>
            <SideNavLink to="/app/users"   icon="people" label="Users" />
            <SideNavLink to="/app/dns"     icon="dns"    label="DNS" />
            <SideNavLink to="/app/domains" icon="web"    label="Domains" />
            <SideNavLink to="/app/ftp"     icon="ftp"    label="FTP" />
            <PluginLinks items={pluginNav} section="hosting" />
          </>
        )}

        <div className="nav-section">My Space</div>
        <SideNavLink to="/app/files"     icon="folder_open" label="Files" />
        <SideNavLink to="/app/databases" icon="storage"     label="Databases" />
        <SideNavLink to="/app/redirects" icon="swap_horiz"  label="Redirects" />
        <PluginLinks items={pluginNav} section="my_space" />

        {isAdmin && (
          <>
            <div className="nav-section">Security</div>
            <SideNavLink to="/app/ssh" icon="terminal" label="SSH Keys" />
            <SideNavLink to="/app/ssl" icon="lock"     label="SSL" />
            <PluginLinks items={pluginNav} section="security" />
          </>
        )}
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
