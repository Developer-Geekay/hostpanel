import { useTheme } from '../../lib/theme';
import { SidebarShell } from './SidebarShell';
import { RailShell } from './RailShell';
import { TopbarShell } from './TopbarShell';

export function Shell() {
  const { layout } = useTheme();
  if (layout === 'rail')    return <RailShell />;
  if (layout === 'topbar')  return <TopbarShell />;
  return <SidebarShell />;
}
