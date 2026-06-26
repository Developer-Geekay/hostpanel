export interface RawNavItem {
  nav_route: string;
  nav_label: string;
  nav_icon?: string;
  nav_section?: string;
  nav_section_label?: string;
  nav_section_order?: number;
  admin_only?: boolean;
}

export interface PackageItem {
  name: string;
  version: string;
  description: string;
  compatible: boolean;
  needs_provisioning?: boolean;
  service?: string | { name: string; unit: string };
  nav_items?: RawNavItem[];
  source_type?: 'github_zip' | 'pypi' | 'upload' | null;
  source?: string | null;
}

export interface VersionEntry {
  tag: string;
  version: string;
  download_url: string | null;
  release_notes: string;
  published_at?: string;
}

export interface CheckUpdateResult {
  checkable: boolean;
  reason?: string;
  current_version?: string;
  latest_version?: string;
  has_update?: boolean;
  download_url?: string | null;
  tag?: string;
  release_notes?: string;
  error?: string | null;
  available_versions?: VersionEntry[];
}

export interface UploadUpdateResult {
  status: string;
  previous_version: string;
  new_version: string;
  is_upgrade: boolean;
  logs: string;
  message?: string;
}

export interface InstallResponse {
  logs?: string;
  output?: string;
  message?: string;
}

export interface UnprovisionedZones {
  zones: string[];
  default_domain: string;
  certbot_available: boolean;
}

export interface ProvisionResult {
  domain: string;
  status: 'provisioned' | 'already_provisioned' | 'error';
  ssl_requested?: boolean;
  error?: string;
}

export type InstallMode = 'pip' | 'file';
export type CheckState = 'idle' | 'checking' | 'available' | 'current' | 'error';
