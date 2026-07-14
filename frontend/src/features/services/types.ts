export interface Service {
  name: string;
  unit: string;
  status: string;
  label: string;
  icon?: string;
  can_reload: boolean;
  config_path?: string | null;
}

export interface LogResponse {
  lines: string[];
}

export type LineCount = 200 | 500 | 1000;
