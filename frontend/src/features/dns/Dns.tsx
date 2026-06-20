import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useDns } from './hooks/useDns';
import { ZoneList } from './components/ZoneList';
import { RecordTable } from './components/RecordTable';
import { AddZoneModal } from './components/AddZoneModal';
import { AddRecordModal } from './components/AddRecordModal';

export default function Dns() {
  const dns = useDns();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">DNS</div>
          <div className="page-desc">Manage DNS zones and records</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!dns.selectedZone && (
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => { dns.setNewZone(''); dns.setAddZoneOpen(true); }}>Add Zone</Button>
          )}
          {dns.selectedZone && (
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => dns.setAddRecordOpen(true)}>Add Record</Button>
          )}
        </div>
      </div>

      {!dns.selectedZone ? (
        dns.zonesLoading ? <PageSpinner /> : (
          <ZoneList
            zones={dns.zones}
            deleteTarget={dns.deleteZoneTarget}
            onSelect={dns.loadRecords}
            onDeleteClick={dns.setDeleteZoneTarget}
            onDeleteConfirm={dns.confirmDeleteZone}
            onDeleteCancel={() => dns.setDeleteZoneTarget('')}
          />
        )
      ) : (
        dns.recordsLoading ? <PageSpinner /> : (
          <RecordTable
            zone={dns.selectedZone}
            records={dns.filteredRecords}
            typeFilter={dns.typeFilter}
            deleteTarget={dns.deleteRecordTarget}
            onBack={() => { dns.setSelectedZone(null); dns.setRecords([]); }}
            onFilterChange={dns.setTypeFilter}
            onDeleteClick={dns.setDeleteRecordTarget}
            onDeleteConfirm={dns.confirmDeleteRecord}
            onDeleteCancel={() => dns.setDeleteRecordTarget('')}
          />
        )
      )}

      <AddZoneModal
        open={dns.addZoneOpen}
        value={dns.newZone}
        saving={dns.savingZone}
        onChange={dns.setNewZone}
        onClose={() => { dns.setAddZoneOpen(false); dns.setNewZone(''); }}
        onSubmit={dns.addZone}
      />

      <AddRecordModal
        open={dns.addRecordOpen}
        form={dns.recordForm}
        saving={dns.savingRecord}
        onChange={dns.setRecordForm}
        onClose={() => dns.setAddRecordOpen(false)}
        onSubmit={dns.addRecord}
      />
    </div>
  );
}
