import { useState, useEffect, useRef } from 'react';
import type { SystemStats } from '../types';

const RECONNECT_DELAY = 3000;

export function useDashboard() {
  const [stats, setStats]           = useState<SystemStats | null>(null);
  const [connected, setConnected]   = useState(false);
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
          setStats(JSON.parse(e.data) as SystemStats);
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

  return { stats, connected, lastUpdated };
}
