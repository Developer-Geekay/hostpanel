export interface SystemStats {
  cpu: number;
  memory: { total: number; available: number; percent: number };
  disk: { total: number; used: number; free: number; percent: number };
}
