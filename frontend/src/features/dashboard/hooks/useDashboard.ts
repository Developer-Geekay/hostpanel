import { useState, useEffect, useRef } from 'react';
import type { SystemStats, StatsHistory } from '../types';

const RECONNECT_DELAY = 3000;
const HISTORY_LEN = 40;

const EMPTY_HISTORY: StatsHistory = { cpu: [], mem: [], netSent: [], netRecv: [] };

export function useDashboard() {
  const [stats, setStats]             = useState<SystemStats | null>(null);
  const [history, setHistory]         = useState<StatsHistory>(EMPTY_HISTORY);
  const [connected, setConnected]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const wsRef    = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      const token    = localStorage.getItem('auth_token') ?? '';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url      = `${protocol}//${window.location.host}/cpanelapi/system/stats/ws?token=${token}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        try {
          const s = JSON.parse(e.data) as SystemStats;
          setStats(s);
          setHistory(h => ({
            cpu:     [...h.cpu,     s.cpu].slice(-HISTORY_LEN),
            mem:     [...h.mem,     s.memory.percent].slice(-HISTORY_LEN),
            netSent: [...h.netSent, s.network?.bytes_sent ?? 0].slice(-HISTORY_LEN),
            netRecv: [...h.netRecv, s.network?.bytes_recv ?? 0].slice(-HISTORY_LEN),
          }));
          setLastUpdated(new Date());
        } catch { /* ignore malformed frame */ }
      };

      ws.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      retryRef.current && clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { stats, history, connected, lastUpdated };
}
