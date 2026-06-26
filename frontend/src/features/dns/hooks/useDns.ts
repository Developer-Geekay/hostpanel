import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import type { DnsZone, DnsRecord, RecordForm } from '../types';

const EMPTY_RECORD_FORM: RecordForm = { name: '@', type: 'A', content: '', ttl: 300 };

export function useDns() {
  const toast = useToast();

  // Zones
  const [zones, setZones] = useState<DnsZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<DnsZone | null>(null);
  const [addZoneOpen, setAddZoneOpen] = useState(false);
  const [newZone, setNewZone] = useState('');
  const [savingZone, setSavingZone] = useState(false);
  const [deleteZoneTarget, setDeleteZoneTarget] = useState('');

  // Records
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [recordForm, setRecordForm] = useState<RecordForm>(EMPTY_RECORD_FORM);
  const [savingRecord, setSavingRecord] = useState(false);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState('');

  const loadZones = useCallback(async () => {
    try {
      const zoneList = await apiGet<DnsZone[]>('dns/zones');
      setZones(zoneList);
      
      // Fetch record count for all zones in parallel in the background
      for (const zone of zoneList) {
        apiGet<DnsRecord[]>(`dns/zones/${zone.name}/records`)
          .then(recs => {
            setZones(prev => prev.map(z => z.name === zone.name ? { ...z, record_count: recs.length } : z));
          })
          .catch(() => {});
      }
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to load DNS zones');
    } finally {
      setZonesLoading(false);
    }
  }, [toast]);

  const loadRecords = useCallback(async (zone: DnsZone) => {
    setSelectedZone(zone);
    setRecordsLoading(true);
    setTypeFilter('All');
    try {
      const data = await apiGet<DnsRecord[]>(`dns/zones/${zone.name}/records`);
      setRecords(data);
      setZones(prev => prev.map(z => z.name === zone.name ? { ...z, record_count: data.length } : z));
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to load records');
    } finally {
      setRecordsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadZones(); }, [loadZones]);

  async function addZone() {
    if (!newZone.trim()) return;
    setSavingZone(true);
    try {
      await apiPost('dns/zones', { name: newZone.trim() });
      toast.ok(`Zone ${newZone} created`);
      setAddZoneOpen(false);
      setNewZone('');
      loadZones();
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to create zone');
    } finally {
      setSavingZone(false);
    }
  }

  async function confirmDeleteZone(name: string) {
    try {
      await apiDelete(`dns/zones/${name}`);
      toast.ok(`Zone ${name} deleted`);
      if (selectedZone?.name === name) { setSelectedZone(null); setRecords([]); }
      setDeleteZoneTarget('');
      loadZones();
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function addRecord() {
    if (!selectedZone) return;
    setSavingRecord(true);
    try {
      await apiPost(`dns/zones/${selectedZone.name}/records`, recordForm);
      toast.ok('Record added');
      setAddRecordOpen(false);
      setRecordForm(EMPTY_RECORD_FORM);
      loadRecords(selectedZone);
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to add record');
    } finally {
      setSavingRecord(false);
    }
  }

  async function confirmDeleteRecord(id: string) {
    if (!selectedZone) return;
    try {
      await apiDelete(`dns/zones/${selectedZone.name}/records/${id}`);
      toast.ok('Record deleted');
      setDeleteRecordTarget('');
      loadRecords(selectedZone);
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const filteredRecords = typeFilter === 'All' ? records : records.filter(r => r.type === typeFilter);

  return {
    zones, zonesLoading, selectedZone, setSelectedZone, setRecords,
    addZoneOpen, setAddZoneOpen, newZone, setNewZone, savingZone,
    deleteZoneTarget, setDeleteZoneTarget,
    addZone, confirmDeleteZone, loadRecords, loadZones,
    records, filteredRecords, recordsLoading, typeFilter, setTypeFilter,
    addRecordOpen, setAddRecordOpen, recordForm, setRecordForm, savingRecord,
    deleteRecordTarget, setDeleteRecordTarget,
    addRecord, confirmDeleteRecord,
  };
}
