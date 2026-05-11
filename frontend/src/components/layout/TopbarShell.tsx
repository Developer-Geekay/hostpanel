import { Outlet } from 'react-router-dom';
import { TopbarNav } from '../nav/TopbarNav';

export function TopbarShell() {
  return (
    <div className="shell-topbar">
      <TopbarNav />
      <main className="topbar-content" style={{ overflow: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  );
}
