import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import type { Service } from '../types';

export function useServices() {
  const toast = useToast();
  const [services, setServices]     = useState<Service[]>([]);
  const [loading, setLoading]       = useState(true);
  const [actingOn, setActingOn]     = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      const data = await apiGet<Service[]>('services');
      setServices(data);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchServices();
    const id = setInterval(fetchServices, 5000);
    return () => clearInterval(id);
  }, [fetchServices]);

  async function serviceAction(name: string, action: 'start' | 'stop' | 'restart' | 'reload') {
    setActingOn(name);
    try {
      await apiPost(`services/${name}/${action}`);
      toast.ok(`${name} ${action}ed`);
      await fetchServices();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : `Failed to ${action} ${name}`);
    } finally {
      setActingOn(null);
    }
  }

  function toggleLog(name: string) {
    setExpandedLog(prev => (prev === name ? null : name));
  }

  return { services, loading, actingOn, expandedLog, fetchServices, serviceAction, toggleLog };
}
