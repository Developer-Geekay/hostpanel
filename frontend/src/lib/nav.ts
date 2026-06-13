export interface NavItem {
  route: string;
  label: string;
  icon: string;
  adminOnly: boolean;
}

export interface NavSection {
  key: string;
  label: string;
  order: number;
  adminOnly: boolean;
  items: NavItem[];
}

export const CORE_SECTIONS: NavSection[] = [
  {
    key: 'system',
    label: 'System',
    order: 0,
    adminOnly: true,
    items: [
      { route: 'dashboard', label: 'Dashboard', icon: 'speed',            adminOnly: true },
      { route: 'services',  label: 'Services',  icon: 'settings_suggest', adminOnly: true },
      { route: 'packages',  label: 'Packages',  icon: 'extension',        adminOnly: true },
    ],
  },
  {
    key: 'hosting',
    label: 'Hosting',
    order: 10,
    adminOnly: true,
    items: [
      { route: 'users', label: 'Users', icon: 'people', adminOnly: true },
      { route: 'dns',   label: 'DNS',   icon: 'dns',    adminOnly: true },
    ],
  },
  {
    key: 'security',
    label: 'Security',
    order: 30,
    adminOnly: true,
    items: [
      { route: 'ssh',   label: 'SSH Keys',  icon: 'terminal', adminOnly: true },
      { route: 'ssl',   label: 'SSL',       icon: 'lock',     adminOnly: true },
      { route: 'audit', label: 'Audit Log', icon: 'audit',    adminOnly: true },
    ],
  },
];
