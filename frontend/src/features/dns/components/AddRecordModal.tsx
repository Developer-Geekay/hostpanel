import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import type { RecordForm } from '../types';

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'];

interface Props {
  open: boolean;
  form: RecordForm;
  saving: boolean;
  onChange: (f: RecordForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function AddRecordModal({ open, form, saving, onChange, onClose, onSubmit }: Props) {
  const set = (patch: Partial<RecordForm>) => onChange({ ...form, ...patch });
  return (
    <Modal open={open} onClose={onClose} title="Add DNS Record" width={440}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!form.content.trim()} onClick={onSubmit}>
            Add
          </Button>
        </div>
      }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Name</label>
          <input value={form.name} onChange={e => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Type</label>
          <select value={form.type} onChange={e => set({ type: e.target.value })}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1/-1' }}>
          <label>Content</label>
          <input
            value={form.content}
            onChange={e => set({ content: e.target.value })}
            placeholder="e.g. 1.2.3.4"
            autoFocus
          />
        </div>
        <div className="field">
          <label>TTL (seconds)</label>
          <input type="number" value={form.ttl} onChange={e => set({ ttl: Number(e.target.value) })} />
        </div>
      </div>
    </Modal>
  );
}
