export interface DiskPartition {
  mountpoint: string;
  device: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface SystemStats {
  cpu: number;
  memory: { total: number; available: number; percent: number };
  disks: DiskPartition[];
  network: { bytes_sent: number; bytes_recv: number };
  uptime?: number;
  load_avg?: number[];
  hostname?: string;
  os?: string;
  kernel?: string;
}

export interface StatsHistory {
  cpu: number[];
  mem: number[];
  netSent: number[];
  netRecv: number[];
}
