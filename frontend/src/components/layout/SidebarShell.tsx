import { Outlet } from 'react-router-dom';
import { SidebarNav } from '../nav/SidebarNav';
import { PanelFX } from '../panel/PanelFX';

export function SidebarShell() {
  return (
    <div className="shell-sidebar">
      <PanelFX />
      <SidebarNav />
      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  );
}
