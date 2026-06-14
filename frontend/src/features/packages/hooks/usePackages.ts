import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost, apiPostForm } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import type {
  PackageItem, CheckUpdateResult, UploadUpdateResult, InstallResponse,
  UnprovisionedZones, ProvisionResult, InstallMode, CheckState,
} from '../types';

export function usePackages() {
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
  const fileRef = useRef<HTMLInputElement>(null);

  const [uninstallTarget, setUninstallTarget] = useState<PackageItem | null>(null);
  const [forceUninstall, setForceUninstall] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const [updateTarget, setUpdateTarget] = useState<PackageItem | null>(null);
  const [checkState, setCheckState] = useState<CheckState>('idle');
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

  const restartingRef = useRef(false);
  const wasInstallRef = useRef(false);

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

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  function pollUntilUp(attempts = 0) {
    const MAX_ATTEMPTS = 20;
    apiGet<{ data: PackageItem[] }>('packages/installed')
      .then(async data => {
        restartingRef.current = false;
        setPackages(data.data);
        setRestarting(false);
        if (wasInstallRef.current) {
          wasInstallRef.current = false;
          const needsProvision = data.data.some(p => p.needs_provisioning);
          if (needsProvision) {
            try {
              const zones = await apiGet<UnprovisionedZones>('domains/unprovisioned-zones');
              if (zones.zones.length > 0) {
                const sel: Record<string, boolean> = {};
                const ssl: Record<string, boolean> = {};
                zones.zones.forEach(z => { sel[z] = z === zones.default_domain; ssl[z] = false; });
                setProvisionData(zones);
                setProvisionSelected(sel);
                setProvisionSsl(ssl);
                setProvisionResults(null);
                return;
              }
            } catch { /* provisioning endpoint unavailable */ }
          }
        }
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

  function startRestart(isInstall = false) {
    wasInstallRef.current = isInstall;
    restartingRef.current = true;
    setRestarting(true);
    pollUntilUp();
  }

  function openInstall() {
    setPipSource('');
    setSelectedFile(null);
    setInstallLogs('');
    setInstallMode('pip');
    setInstallOpen(true);
  }

  function closeInstall() { setInstallOpen(false); }

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

  function openUninstall(pkg: PackageItem) { setUninstallTarget(pkg); setForceUninstall(false); }

  function closeUninstall() { setUninstallTarget(null); setForceUninstall(false); }

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

  function openUpdate(pkg: PackageItem) { closeUpdateModal(); setUpdateTarget(pkg); }

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
      if (!result.checkable) setCheckState('error');
      else if (result.error && !result.has_update) setCheckState('error');
      else setCheckState(result.has_update ? 'available' : 'current');
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
      await apiPost('packages/registry', { package_name: pkgName, source: linkSource.trim(), source_type: sourceType });
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

  async function handleProvision() {
    if (!provisionData) return;
    const selected = provisionData.zones
      .filter(z => provisionSelected[z])
      .map(z => ({ domain: z, issue_ssl: provisionSsl[z] ?? false }));
    if (selected.length === 0) { setProvisionData(null); window.location.reload(); return; }
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

  function skipProvision() { setProvisionData(null); window.location.reload(); }
  function closeProvisionResults() { setProvisionResults(null); setProvisionData(null); window.location.reload(); }

  return {
    // list
    packages, loading, restarting,
    // install
    installOpen, installMode, setInstallMode, pipSource, setPipSource,
    selectedFile, setSelectedFile, installing, installLogs, fileRef,
    openInstall, closeInstall, handleInstall,
    // uninstall
    uninstallTarget, forceUninstall, setForceUninstall, uninstalling,
    openUninstall, closeUninstall, handleUninstall,
    // update
    updateTarget, checkState, checkResult, updating, updateLogs,
    linkSource, setLinkSource, savingSource, updateFileRef, updateFile, setUpdateFile,
    uploadUpdating, uploadUpdateResult, selectedVersionTag, setSelectedVersionTag,
    openUpdate, closeUpdateModal, handleCheckUpdate, handleSaveAndCheck, handleUpdateNow, handleUploadUpdate,
    // provision
    provisionData, provisionSelected, setProvisionSelected, provisionSsl, setProvisionSsl,
    provisioning, provisionResults, handleProvision, skipProvision, closeProvisionResults,
  };
}
