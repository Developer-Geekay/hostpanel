import { Outlet } from 'react-router-dom';
import { SidebarNav } from '../nav/SidebarNav';

export function SidebarShell() {
  return (
    <div className="shell-sidebar">
      <SidebarNav />
      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  );
}
