import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

interface Props {
  domain: string;
  cert: string;
  setCert: (v: string) => void;
  privKey: string;
  setPrivKey: (v: string) => void;
  chain: string;
  setChain: (v: string) => void;
  importing: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export function ImportCertModal({
  domain, cert, setCert, privKey, setPrivKey, chain, setChain,
  importing, onClose, onSubmit,
}: Props) {
  const allFilled = cert.trim() && privKey.trim() && chain.trim();

  return (
    <Modal
      open={!!domain}
      onClose={() => { if (!importing) onClose(); }}
      title={`Import Certificate — ${domain}`}
      width={520}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={importing}>Cancel</Button>
          <Button variant="primary" size="sm" loading={importing} disabled={!allFilled} onClick={onSubmit}>
            Install Certificate
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label>Certificate (cert.pem)</label>
          <textarea
            value={cert}
            onChange={e => setCert(e.target.value)}
            placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
            rows={5}
            disabled={importing}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, resize: 'vertical' }}
          />
        </div>
        <div className="field">
          <label>Private Key (privkey.pem)</label>
          <textarea
            value={privKey}
            onChange={e => setPrivKey(e.target.value)}
            placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
            rows={5}
            disabled={importing}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, resize: 'vertical' }}
          />
        </div>
        <div className="field">
          <label>CA Chain (chain.pem)</label>
          <textarea
            value={chain}
            onChange={e => setChain(e.target.value)}
            placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
            rows={4}
            disabled={importing}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, resize: 'vertical' }}
          />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
          Files are written to <code>/opt/hostpanel/custom-certs/{domain}/</code>. Nginx will reload automatically.
        </p>
      </div>
    </Modal>
  );
}
