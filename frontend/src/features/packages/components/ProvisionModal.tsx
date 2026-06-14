import { ShieldCheck } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import type { UnprovisionedZones, ProvisionResult } from '../types';

interface ProvisionProps {
  data: UnprovisionedZones | null;
  selected: Record<string, boolean>;
  ssl: Record<string, boolean>;
  provisioning: boolean;
  onSelectedChange: (zone: string, checked: boolean) => void;
  onSslChange: (zone: string) => void;
  onProvision: () => void;
  onSkip: () => void;
}

export function ProvisionModal({
  data, selected, ssl, provisioning,
  onSelectedChange, onSslChange, onProvision, onSkip,
}: ProvisionProps) {
  return (
    <Modal
      open={!!data}
      onClose={() => {}}
      title="Provision Websites"
      width={500}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={provisioning}>Skip</Button>
          <Button
            variant="primary"
            size="sm"
            loading={provisioning}
            onClick={onProvision}
            disabled={provisioning || !data?.zones.some(z => selected[z])}
          >
            Provision
          </Button>
        </div>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
        The following DNS zones are not yet set up as websites. Select which ones to provision:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {data?.zones.map((zone, i) => (
          <div
            key={zone}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
              borderBottom: i < (data.zones.length - 1) ? '1px solid var(--border)' : 'none',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={selected[zone] ?? false}
                onChange={e => onSelectedChange(zone, e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span className="mono" style={{ fontWeight: 500 }}>{zone}</span>
              {zone === data.default_domain && (
                <span className="badge badge-dim" style={{ fontSize: 10, padding: '2px 6px' }}>default</span>
              )}
            </label>

            {data.certbot_available && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                color: selected[zone] ? 'var(--text-2)' : 'var(--text-3)',
                cursor: selected[zone] ? 'pointer' : 'not-allowed',
                textTransform: 'none', letterSpacing: 0,
              }}>
                <Toggle
                  checked={ssl[zone] ?? false}
                  onChange={() => { if (!selected[zone]) return; onSslChange(zone); }}
                  disabled={!selected[zone]}
                />
                <ShieldCheck size={13} strokeWidth={1.5} />
                Issue SSL
              </label>
            )}
          </div>
        ))}
      </div>

      {!data?.certbot_available && (
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 14, lineHeight: 1.5 }}>
          SSL issuance is not available — certbot is not installed on this server.
        </p>
      )}
    </Modal>
  );
}

interface ResultsProps {
  results: ProvisionResult[] | null;
  onDone: () => void;
}

export function ProvisionResultsModal({ results, onDone }: ResultsProps) {
  return (
    <Modal
      open={!!results}
      onClose={() => {}}
      title="Provisioning Complete"
      width={460}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="primary" size="sm" onClick={onDone}>Done</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results?.map(r => (
          <div key={r.domain} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            {r.status === 'provisioned' ? (
              <span className="badge badge-ok">✓</span>
            ) : r.status === 'already_provisioned' ? (
              <span className="badge badge-dim">–</span>
            ) : (
              <span className="badge badge-err">✕</span>
            )}
            <span className="mono" style={{ flex: 1 }}>{r.domain}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
              {r.status === 'provisioned'
                ? r.ssl_requested ? 'provisioned · SSL pending' : 'provisioned'
                : r.status === 'already_provisioned' ? 'already active'
                : r.error ?? 'error'}
            </span>
          </div>
        ))}
      </div>
      {results?.some(r => r.ssl_requested) && (
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 14, lineHeight: 1.5 }}>
          SSL certificate issuance is running in the background. Check the SSL page in a moment.
        </p>
      )}
    </Modal>
  );
}
