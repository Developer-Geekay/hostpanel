import { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Plus, Trash2, Upload, ShieldCheck, RefreshCw } from 'lucide-react';
import { apiGet, apiPost, apiPostForm } from '../../lib/api';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';

interface PackageItem {
  name: string;
  version: string;
  description: string;
  compatible: boolean;
  needs_provisioning?: boolean;
  service?: string | { name: string; unit: string };
  nav_items?: string[];
  source_type?: 'github_zip' | 'pypi' | 'upload' | null;
  source?: string | null;
}

interface VersionEntry {
  tag: string;
  version: string;
  download_url: string | null;
  release_notes: string;
  published_at?: string;
}

interface CheckUpdateResult {
  checkable: boolean;
  reason?: string;
  current_version?: string;
  latest_version?: string;
  has_update?: boolean;
  download_url?: string | null;
  tag?: string;
  release_notes?: string;
  error?: string | null;
  available_versions?: VersionEntry[];
}

interface UploadUpdateResult {
  status: string;
  previous_version: string;
  new_version: string;
  is_upgrade: boolean;
  logs: string;
  message?: string;
}

interface InstallResponse {
  logs?: string;
  output?: string;
  message?: string;
}

interface UnprovisionedZones {
  zones: string[];
  default_domain: string;
  certbot_available: boolean;
}

interface ProvisionResult {
  domain: string;
  status: 'provisioned' | 'already_provisioned' | 'error';
  ssl_requested?: boolean;
  error?: string;
}

type InstallMode = 'pip' | 'file';

export default function Packages() {
  const toast = useToast();
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
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
  // ── Update modal state ────────────────────────────────────────────────────
  const [updateTarget, setUpdateTarget] = useState<PackageItem | null>(null);
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'available' | 'current' | 'error'>('idle');
  const [checkResult, setCheckResult] = useState<CheckUpdateResult | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateLogs, setUpdateLogs] = useState('');
  const [linkSource, setLinkSource] = useState('');
  const [savingSource, setSavingSource] = useState(false);
  const updateFileRef = useRef<HTMLInputElement>(null);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [uploadUpdating, setUploadUpdating] = useState(false);
  const [uploadUpdateResult, setUploadUpdateResult] = useState<UploadUpdateResult | null>(null);
  const [selectedVersionTag, setSelectedVersionTag] = useState<string | null>(null);
  // Tracks whether we're in an intentional restart window so stale useEffect
  // re-fires don't surface spurious "Failed to fetch" error toasts.
  const restartingRef = useRef(false);
  // True when the restart was triggered by an install (not uninstall).
  const wasInstallRef = useRef(false);

  // ── Provisioning modal state ──────────────────────────────────────────────
  const [provisionData, setProvisionData] = useState<UnprovisionedZones | null>(null);
  const [provisionSelected, setProvisionSelected] = useState<Record<string, boolean>>({});
  const [provisionSsl, setProvisionSsl] = useState<Record<string, boolean>>({});
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResults, setProvisionResults] = useState<ProvisionResult[] | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      const data = await apiGet<{ data: PackageItem[] }>('packages/installed');
      setPackages(data.data);
    } catch (err: unknown) {
      if (!restartingRef.current) {
        toast.err(err instanceof Error ? err.message : 'Failed to load packages');
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  function startRestart(isInstall = false) {
    wasInstallRef.current = isInstall;
    restartingRef.current = true;
    setRestarting(true);
    pollUntilUp();
  }

  function pollUntilUp(attempts = 0) {
    const MAX_ATTEMPTS = 20; // 20 × 2 s = 40 s max
    apiGet<{ data: PackageItem[] }>('packages/installed')
      .then(async data => {
        restartingRef.current = false;
        setPackages(data.data);
        setRestarting(false);

        // After an install: check if any newly installed package needs provisioning
        if (wasInstallRef.current) {
          wasInstallRef.current = false;
          const needsProvision = data.data.some(p => p.needs_provisioning);
          if (needsProvision) {
            try {
              const zones = await apiGet<UnprovisionedZones>('domains/unprovisioned-zones');
              if (zones.zones.length > 0) {
                // Pre-select default domain only; all SSL off by default
                const sel: Record<string, boolean> = {};
                const ssl: Record<string, boolean> = {};
                zones.zones.forEach(z => {
                  sel[z] = z === zones.default_domain;
                  ssl[z] = false;
                });
                setProvisionData(zones);
                setProvisionSelected(sel);
                setProvisionSsl(ssl);
                setProvisionResults(null);
                return; // stay on page — modal will show
              }
            } catch {
              // provisioning endpoint unavailable (plugin not installed?) — just reload
            }
          }
        }

        // No provisioning needed — reload so new nav items appear
        window.location.reload();
      })
      .catch(() => {
        if (attempts < MAX_ATTEMPTS) {
          setTimeout(() => pollUntilUp(attempts + 1), 2000);
        } else {
          restartingRef.current = false;
          setRestarting(false);
          toast.err('Server did not come back — please refresh the page');
        }
      });
  }

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
        result = await apiPostForm<InstallResponse>('packages/upload', fd);
      }
      const logs = result.logs ?? result.output ?? result.message ?? 'Installed successfully';
      setInstallLogs(logs);
      toast.ok('Package installed — server is restarting…');
      setInstallOpen(false);
      startRestart(true);
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
      toast.ok(`${uninstallTarget.name} uninstalled — server is restarting…`);
      setUninstallTarget(null);
      setForceUninstall(false);
      startRestart(false);
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

  async function handleProvision() {
    if (!provisionData) return;
    const selected = provisionData.zones
      .filter(z => provisionSelected[z])
      .map(z => ({ domain: z, issue_ssl: provisionSsl[z] ?? false }));
    if (selected.length === 0) {
      // Nothing selected = skip
      setProvisionData(null);
      window.location.reload();
      return;
    }
    setProvisioning(true);
    try {
      const resp = await apiPost<{ results: ProvisionResult[] }>('domains/provision', { domains: selected });
      setProvisionResults(resp.results);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      setProvisioning(false);
    }
  }

  function closeUpdateModal() {
    setUpdateTarget(null);
    setCheckState('idle');
    setCheckResult(null);
    setUpdateLogs('');
    setLinkSource('');
    setUpdateFile(null);
    setUploadUpdateResult(null);
    setUpdating(false);
    setUploadUpdating(false);
    if (updateFileRef.current) updateFileRef.current.value = '';
  }

  async function handleCheckUpdate() {
    if (!updateTarget) return;
    setCheckState('checking');
    setCheckResult(null);
    setSelectedVersionTag(null);
    try {
      const result = await apiGet<CheckUpdateResult>(`packages/check-update/${updateTarget.name}`);
      setCheckResult(result);
      if (!result.checkable) {
        setCheckState('error');
      } else if (result.error && !result.has_update) {
        setCheckState('error');
      } else {
        setCheckState(result.has_update ? 'available' : 'current');
      }
    } catch (err) {
      setCheckResult({ checkable: true, error: err instanceof Error ? err.message : 'Check failed' });
      setCheckState('error');
    }
  }

  async function handleSaveAndCheck() {
    if (!updateTarget || !linkSource.trim()) return;
    setSavingSource(true);
    const pkgName = updateTarget.name;
    const sourceType: 'github_zip' | 'pypi' = linkSource.trim().startsWith('http') ? 'github_zip' : 'pypi';
    try {
      await apiPost('packages/registry', {
        package_name: pkgName,
        source: linkSource.trim(),
        source_type: sourceType,
      });
      setUpdateTarget(prev => prev ? { ...prev, source_type: sourceType, source: linkSource.trim() } : null);
      setPackages(prev => prev.map(p => p.name === pkgName ? { ...p, source_type: sourceType, source: linkSource.trim() } : p));
      setCheckState('checking');
      const result = await apiGet<CheckUpdateResult>(`packages/check-update/${pkgName}`);
      setCheckResult(result);
      setCheckState(!result.checkable ? 'error' : result.has_update ? 'available' : 'current');
    } catch (err) {
      toast.err(err instanceof Error ? err.message : 'Failed to save source');
      setCheckState('idle');
    } finally {
      setSavingSource(false);
    }
  }

  async function handleUpdateNow() {
    if (!updateTarget) return;
    const versions = checkResult?.available_versions ?? [];
    const selected = versions.find(v => v.tag === selectedVersionTag) ?? versions[0];
    const downloadUrl = selected?.download_url ?? checkResult?.download_url;
    if (!downloadUrl) return;
    setUpdating(true);
    setUpdateLogs('');
    try {
      const result = await apiPost<{ logs?: string; message?: string }>('packages/update', {
        package_name: updateTarget.name,
        source: downloadUrl,
      });
      setUpdateLogs(result.logs ?? result.message ?? 'Updated successfully');
      toast.ok(`${updateTarget.name} updated — server is restarting…`);
      closeUpdateModal();
      startRestart(false);
    } catch (err) {
      toast.err(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  }

  async function handleUploadUpdate() {
    if (!updateTarget || !updateFile) return;
    setUploadUpdating(true);
    try {
      const fd = new FormData();
      fd.append('file', updateFile);
      fd.append('package_name', updateTarget.name);
      const result = await apiPostForm<UploadUpdateResult>('packages/update/upload', fd);
      setUploadUpdateResult(result);
      toast.ok(`${updateTarget.name} updated — server is restarting…`);
      startRestart(false);
    } catch (err) {
      toast.err(err instanceof Error ? err.message : 'Upload update failed');
    } finally {
      setUploadUpdating(false);
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
          disabled={restarting}
        >
          Install Package
        </Button>
      </div>

      {restarting && (
        <div className="badge badge-warn" style={{ marginBottom: 16, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content' }}>
          <span style={{ fontSize: 13 }}>⟳ Server is restarting — refreshing package list…</span>
        </div>
      )}

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
                    {pkg.service && typeof pkg.service === 'object' ? pkg.service.name : (pkg.service ?? '—')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RefreshCw size={12} strokeWidth={1.5} />}
                        onClick={() => { closeUpdateModal(); setUpdateTarget(pkg); }}
                        title="Update package"
                      >
                        Update
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => { setUninstallTarget(pkg); setForceUninstall(false); }}
                      >
                        Uninstall
                      </Button>
                    </div>
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
            {installLogs ? (
              <Button variant="ghost" size="sm" onClick={() => setInstallOpen(false)}>
                Close
              </Button>
            ) : (
              <>
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
              </>
            )}
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

      {/* ── Update modal ──────────────────────────────────────────────────── */}
      <Modal
        open={!!updateTarget}
        onClose={updating || uploadUpdating || savingSource ? () => {} : closeUpdateModal}
        title={`Update — ${updateTarget?.name ?? ''}`}
        width={520}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={closeUpdateModal} disabled={updating || uploadUpdating || savingSource}>
              Close
            </Button>
          </div>
        }
      >
        {/* Section 1 — Check for Updates */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-3)', marginBottom: 10, fontWeight: 600 }}>
            Check for Updates
          </div>

          {(!updateTarget?.source_type || updateTarget.source_type === 'upload') && checkState === 'idle' ? (
            <div>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5 }}>
                Installed from a local file. Link a GitHub release URL or pip package name to enable future update checks.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={linkSource}
                  onChange={e => setLinkSource(e.target.value)}
                  placeholder="https://github.com/… or pip-package-name"
                  disabled={savingSource}
                  style={{ flex: 1 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAndCheck(); }}
                />
                <Button variant="primary" size="sm" loading={savingSource} disabled={!linkSource.trim()} onClick={handleSaveAndCheck}>
                  Save & Check
                </Button>
              </div>
            </div>
          ) : checkState === 'idle' ? (
            <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />} onClick={handleCheckUpdate}>
              Check for Updates
            </Button>
          ) : checkState === 'checking' ? (
            <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={13} strokeWidth={1.5} className="spin-icon" /> Checking…
            </div>
          ) : checkState === 'available' ? (
            <div>
              {(() => {
                const versions = checkResult?.available_versions ?? [];
                const activeTag = selectedVersionTag ?? versions[0]?.tag ?? null;
                const activeVersion = versions.find(v => v.tag === activeTag) ?? versions[0];
                return (
                  <>
                    {/* current → selected header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span className="badge badge-dim" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>v{checkResult?.current_version}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 13 }}>→</span>
                      <span className="badge badge-ok" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>v{activeVersion?.version ?? checkResult?.latest_version}</span>
                    </div>

                    {/* version picker — only shown when multiple updates available */}
                    {versions.length > 1 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>
                          {versions.length} versions available — select one to install:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                          {versions.map((v, i) => (
                            <label
                              key={v.tag}
                              style={{
                                display: 'flex', alignItems: 'flex-start', gap: 10,
                                padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                                border: `1px solid ${activeTag === v.tag ? 'var(--accent)' : 'var(--border)'}`,
                                background: activeTag === v.tag ? 'var(--accent-dim)' : 'transparent',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="radio"
                                name="pkg-version"
                                value={v.tag}
                                checked={activeTag === v.tag}
                                onChange={() => setSelectedVersionTag(v.tag)}
                                style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0 }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>v{v.version}</span>
                                  {i === 0 && <span className="badge badge-ok" style={{ fontSize: 10, padding: '1px 5px' }}>latest</span>}
                                  {!v.download_url && <span style={{ fontSize: 10, color: 'var(--warn)' }}>no zip</span>}
                                </div>
                                {v.release_notes && (
                                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {v.release_notes.split('\n')[0]}
                                  </div>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* release notes for single-version or selected version */}
                    {versions.length === 1 && activeVersion?.release_notes && (
                      <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5 }}>
                        {activeVersion.release_notes}
                      </p>
                    )}

                    {!activeVersion?.download_url && (
                      <p style={{ fontSize: 11.5, color: 'var(--warn)', marginBottom: 8 }}>
                        No zip asset in this release — use manual upload below.
                      </p>
                    )}
                    {updateLogs ? (
                      <pre style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                        {updateLogs}
                      </pre>
                    ) : activeVersion?.download_url ? (
                      <Button variant="primary" size="sm" loading={updating} onClick={handleUpdateNow}>
                        Update to v{activeVersion.version}
                      </Button>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : checkState === 'current' ? (
            <div style={{ fontSize: 13, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6 }}>
              ✓ Already on latest (v{checkResult?.current_version})
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--warn)' }}>
              ⚠ {checkResult?.error ?? checkResult?.reason ?? 'Check failed'}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {/* Section 2 — Upload Manually */}
        <div>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-3)', marginBottom: 10, fontWeight: 600 }}>
            Upload Manually
          </div>

          {uploadUpdateResult ? (
            <div style={{ fontSize: 13 }}>
              {uploadUpdateResult.is_upgrade ? (
                <span style={{ color: 'var(--ok)' }}>
                  ✓ Updated v{uploadUpdateResult.previous_version} → v{uploadUpdateResult.new_version}
                </span>
              ) : (
                <span style={{ color: 'var(--warn)' }}>
                  ⚠ Same or older version (v{uploadUpdateResult.new_version}) — update applied anyway
                </span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="file"
                ref={updateFileRef}
                accept=".zip,.tar.gz"
                style={{ display: 'none' }}
                onChange={e => setUpdateFile(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={<Upload size={12} strokeWidth={1.5} />}
                onClick={() => updateFileRef.current?.click()}
                disabled={uploadUpdating}
              >
                {updateFile ? updateFile.name : 'Choose zip'}
              </Button>
              {updateFile && (
                <Button variant="primary" size="sm" loading={uploadUpdating} onClick={handleUploadUpdate}>
                  Upload & Update
                </Button>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Provision Domains modal — shown after a package install when unprovisioned DNS zones exist */}
      <Modal
        open={!!provisionData && !provisionResults}
        onClose={() => {}} // dismiss only via Skip or Provision buttons
        title="Provision Websites"
        width={500}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setProvisionData(null); window.location.reload(); }}
              disabled={provisioning}
            >
              Skip
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={provisioning}
              onClick={handleProvision}
              disabled={provisioning || !provisionData?.zones.some(z => provisionSelected[z])}
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
          {provisionData?.zones.map((zone, i) => (
            <div
              key={zone}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 0',
                borderBottom: i < (provisionData.zones.length - 1) ? '1px solid var(--border)' : 'none',
              }}
            >
              {/* Domain checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={provisionSelected[zone] ?? false}
                  onChange={e => {
                    const checked = e.target.checked;
                    setProvisionSelected(prev => ({ ...prev, [zone]: checked }));
                    if (!checked) setProvisionSsl(prev => ({ ...prev, [zone]: false }));
                  }}
                  style={{ width: 'auto' }}
                />
                <span className="mono" style={{ fontWeight: 500 }}>{zone}</span>
                {zone === provisionData.default_domain && (
                  <span className="badge badge-dim" style={{ fontSize: 10, padding: '2px 6px' }}>default</span>
                )}
              </label>

              {/* Per-domain SSL toggle — only visible if certbot is available */}
              {provisionData.certbot_available && (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: provisionSelected[zone] ? 'var(--text-2)' : 'var(--text-3)',
                  cursor: provisionSelected[zone] ? 'pointer' : 'not-allowed',
                  textTransform: 'none', letterSpacing: 0,
                }}>
                  <Toggle
                    checked={provisionSsl[zone] ?? false}
                    onChange={() => {
                      if (!provisionSelected[zone]) return;
                      setProvisionSsl(prev => ({ ...prev, [zone]: !prev[zone] }));
                    }}
                    disabled={!provisionSelected[zone]}
                  />
                  <ShieldCheck size={13} strokeWidth={1.5} />
                  Issue SSL
                </label>
              )}
            </div>
          ))}
        </div>

        {!provisionData?.certbot_available && (
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 14, lineHeight: 1.5 }}>
            SSL issuance is not available — certbot is not installed on this server.
          </p>
        )}
      </Modal>

      {/* Provision results modal — shown after provisioning completes */}
      <Modal
        open={!!provisionResults}
        onClose={() => {}}
        title="Provisioning Complete"
        width={460}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="primary" size="sm" onClick={() => { setProvisionResults(null); setProvisionData(null); window.location.reload(); }}>
              Done
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {provisionResults?.map(r => (
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
        {provisionResults?.some(r => r.ssl_requested) && (
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 14, lineHeight: 1.5 }}>
            SSL certificate issuance is running in the background. Check the SSL page in a moment.
          </p>
        )}
      </Modal>
    </div>
  );
}
