import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings2, Package, Users, Globe, FolderOpen,
  Terminal, Lock, Database, LogOut, Server, Wifi, ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePluginNav, NavItem } from '../../lib/plugins';
import { ThemePicker } from '../ui/ThemePicker';
import { ReactNode } from 'react';

const iconMap: Record<string, ReactNode> = {
  speed:            <LayoutDashboard size={18} strokeWidth={1.5} />,
  settings_suggest: <Settings2 size={18} strokeWidth={1.5} />,
  extension:        <Package size={18} strokeWidth={1.5} />,
  people:           <Users size={18} strokeWidth={1.5} />,
  dns:              <Globe size={18} strokeWidth={1.5} />,
  folder_open:      <FolderOpen size={18} strokeWidth={1.5} />,
  terminal:         <Terminal size={18} strokeWidth={1.5} />,
  lock:             <Lock size={18} strokeWidth={1.5} />,
  storage:          <Database size={18} strokeWidth={1.5} />,
  vpn_lock:         <Wifi size={18} strokeWidth={1.5} />,
  web:              <Globe size={18} strokeWidth={1.5} />,
  swap_horiz:       <ArrowLeftRight size={18} strokeWidth={1.5} />,
  ftp:              <Server size={18} strokeWidth={1.5} />,
};

function RailLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`} title={label}>
      {iconMap[icon] ?? <Server size={18} strokeWidth={1.5} />}
      <span className="rail-tooltip">{label}</span>
    </NavLink>
  );
}

function PluginRailLinks({ items, section }: { items: NavItem[]; section: string }) {
  const { isAdmin } = useAuth();
  return (
    <>
      {items.filter(i => i.section === section && (!i.adminOnly || isAdmin))
        .map(i => <RailLink key={i.route} to={`/app/${i.route}`} icon={i.icon} label={i.label} />)}
    </>
  );
}

export function RailNav() {
  const { user, isAdmin, logout } = useAuth();
  const pluginNav = usePluginNav();
  const navigate  = useNavigate();

  return (
    <nav className="rail">
      <div className="rail-logo">HP</div>

      {isAdmin && (
        <>
          <RailLink to="/app/dashboard" icon="speed"            label="Dashboard" />
          <RailLink to="/app/services"  icon="settings_suggest" label="Services" />
          <RailLink to="/app/packages"  icon="extension"        label="Packages" />
          <RailLink to="/app/users"     icon="people"           label="Users" />
          <RailLink to="/app/dns"       icon="dns"              label="DNS" />
          <RailLink to="/app/domains"   icon="web"              label="Domains" />
          <RailLink to="/app/ftp"       icon="ftp"              label="FTP" />
          <PluginRailLinks items={pluginNav} section="hosting" />
        </>
      )}

      <RailLink to="/app/files"     icon="folder_open" label="Files" />
      <RailLink to="/app/databases" icon="storage"     label="Databases" />
      <RailLink to="/app/redirects" icon="swap_horiz"  label="Redirects" />
      <PluginRailLinks items={pluginNav} section="my_space" />

      {isAdmin && (
        <>
          <RailLink to="/app/ssh" icon="terminal" label="SSH Keys" />
          <RailLink to="/app/ssl" icon="lock"     label="SSL" />
          <PluginRailLinks items={pluginNav} section="security" />
        </>
      )}

      <div className="rail-spacer" />
      <div className="rail-footer">
        <ThemePicker compact />
        <button
          className="rail-item"
          onClick={() => { logout(); navigate('/login'); }}
          title={user?.username ?? 'Logout'}
        >
          <LogOut size={18} strokeWidth={1.5} />
          <span className="rail-tooltip">Logout ({user?.username})</span>
        </button>
      </div>
    </nav>
  );
}
