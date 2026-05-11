import { useTheme } from '../../lib/theme';
import { SidebarShell } from './SidebarShell';
import { PanelShell }   from '../panel/PanelShell';

export function Shell() {
  const { theme } = useTheme();
  if (theme.key === 'panel') return <PanelShell />;
  return <SidebarShell />;
}
