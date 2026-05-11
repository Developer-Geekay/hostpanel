import { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Plus, Trash2, Upload } from 'lucide-react';
import { apiGet, apiPost, apiPostMultipart } from '../../lib/api';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';

interface PackageItem {
  name: string;
  version: string;
  description: string;
  compatible: boolean;
  service?: string;
  nav_items?: string[];
}

interface InstallResponse {
  logs?: string;
  output?: string;
  message?: string;
}

type InstallMode = 'pip' | 'file';

export default function Packages() {
  const toast = useToast();
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [installOpen, setInstallOpen] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode>('pip');
  const [pipSource, setPipSource] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installLogs, setInstallLogs] = useState('');
  const [uninstallTarget, setUninstallTarget] = useState<PackageItem | null>(null);
  const [forceUninstall, setForceUninstall] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchPackages = useCallback(async () => {
    try {
      const data = await apiGet<{ data: PackageItem[] }>('packages/installed');
      setPackages(data.data);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  async function handleInstall() {
    if (installMode === 'pip' && !pipSource.trim()) return;
    if (installMode === 'file' && !selectedFile) return;
    setInstalling(true);
    setInstallLogs('');
    try {
      let result: InstallResponse;
      if (installMode === 'pip') {
        result = await apiPost<InstallResponse>('packages/install', { package_source: pipSource.trim() });
      } else {
        const fd = new FormData();
        fd.append('file', selectedFile!);
        result = await apiPostMultipart<InstallResponse>('packages/upload', fd);
      }
      const logs = result.logs ?? result.output ?? result.message ?? 'Installed successfully';
      setInstallLogs(logs);
      toast.ok('Package installed');
      await fetchPackages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Install failed';
      setInstallLogs(msg);
      toast.err(msg);
    } finally {
      setInstalling(false);
    }
  }

  async function handleUninstall() {
    if (!uninstallTarget) return;
    setUninstalling(true);
    try {
      await apiPost('packages/uninstall', { package_name: uninstallTarget.name, force: forceUninstall });
      toast.ok(`${uninstallTarget.name} uninstalled`);
      setUninstallTarget(null);
      setForceUninstall(false);
      await fetchPackages();
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 409 && !forceUninstall) {
        setForceUninstall(true);
        toast.err('Conflict detected — enable Force to proceed');
      } else {
        toast.err(e.message ?? 'Uninstall failed');
      }
    } finally {
      setUninstalling(false);
    }
  }

  function openInstall() {
    setPipSource('');
    setSelectedFile(null);
    setInstallLogs('');
    setInstallMode('pip');
    setInstallOpen(true);
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Packages</div>
          <div className="page-desc">Manage installed HostPanel packages</div>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={13} strokeWidth={1.5} />}
          onClick={openInstall}
        >
          Install Package
        </Button>
      </div>

      {packages.length === 0 ? (
        <div className="empty">
          <Package size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No packages installed</div>
          <div className="empty-desc">Install packages to extend HostPanel functionality.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>Description</th>
                <th>Status</th>
                <th>Service</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.map(pkg => (
                <tr key={pkg.name}>
                  <td style={{ fontWeight: 500, color: 'var(--text)' }}>{pkg.name}</td>
                  <td className="mono">{pkg.version}</td>
                  <td style={{ color: 'var(--text-2)', maxWidth: 300 }}>{pkg.description}</td>
                  <td>
                    {pkg.compatible
                      ? <span className="badge badge-ok">Compatible</span>
                      : <span className="badge badge-warn">Incompatible</span>
                    }
                  </td>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                    {pkg.service ?? '—'}
                  </td>
                  <td>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={12} strokeWidth={1.5} />}
                      onClick={() => { setUninstallTarget(pkg); setForceUninstall(false); }}
                    >
                      Uninstall
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Install modal */}
      <Modal
        open={installOpen}
        onClose={() => { if (!installing) setInstallOpen(false); }}
        title="Install Package"
        width={520}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setInstallOpen(false)} disabled={installing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={installing}
              icon={<Upload size={13} strokeWidth={1.5} />}
              onClick={handleInstall}
              disabled={installing || (installMode === 'pip' ? !pipSource.trim() : !selectedFile)}
            >
              Install
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Button
            variant={installMode === 'pip' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setInstallMode('pip')}
          >
            Pip / URL
          </Button>
          <Button
            variant={installMode === 'file' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setInstallMode('file')}
          >
            Upload File
          </Button>
        </div>

        {installMode === 'pip' ? (
          <div className="field">
            <label>Package source (pip name, git URL, or path)</label>
            <input
              type="text"
              placeholder="e.g. my-plugin or https://github.com/..."
              value={pipSource}
              onChange={e => setPipSource(e.target.value)}
              disabled={installing}
              onKeyDown={e => { if (e.key === 'Enter') handleInstall(); }}
              autoFocus
            />
          </div>
        ) : (
          <div className="field">
            <label>Package file (.whl, .tar.gz, .zip)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={installing}
              >
                Choose file…
              </Button>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {selectedFile ? selectedFile.name : 'No file selected'}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".whl,.tar.gz,.zip"
              style={{ display: 'none' }}
              onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        {installLogs && (
          <div style={{ marginTop: 14 }}>
            <div className="card-title">Output</div>
            <pre className="log-output" style={{ maxHeight: 200 }}>{installLogs}</pre>
          </div>
        )}
      </Modal>

      {/* Uninstall confirm modal */}
      <Modal
        open={!!uninstallTarget}
        onClose={() => { if (!uninstalling) { setUninstallTarget(null); setForceUninstall(false); } }}
        title="Uninstall Package"
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setUninstallTarget(null); setForceUninstall(false); }}
              disabled={uninstalling}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={uninstalling}
              icon={<Trash2 size={12} strokeWidth={1.5} />}
              onClick={handleUninstall}
            >
              {forceUninstall ? 'Force Uninstall' : 'Uninstall'}
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
          Are you sure you want to uninstall <strong style={{ color: 'var(--text)' }}>{uninstallTarget?.name}</strong>?
          This cannot be undone.
        </p>
        {forceUninstall && (
          <div
            className="badge badge-warn"
            style={{ width: '100%', padding: '10px 12px', fontSize: 12, marginBottom: 12 }}
          >
            A conflict was detected. Force uninstall will remove the package regardless of dependencies.
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', fontSize: 13, letterSpacing: 0 }}>
          <input
            type="checkbox"
            checked={forceUninstall}
            onChange={e => setForceUninstall(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Force uninstall (ignore conflicts)
        </label>
      </Modal>
    </div>
  );
}
