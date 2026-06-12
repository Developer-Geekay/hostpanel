import { Outlet } from 'react-router-dom';
import { RailNav } from '../nav/RailNav';

export function RailShell() {
  return (
    <div className="shell-rail">
      <RailNav />
      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  );
}
