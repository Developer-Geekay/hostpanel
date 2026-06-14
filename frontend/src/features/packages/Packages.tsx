import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { usePackages } from './hooks/usePackages';
import { PackageList } from './components/PackageList';
import { InstallModal } from './components/InstallModal';
import { UninstallModal } from './components/UninstallModal';
import { UpdateModal } from './components/UpdateModal';
import { ProvisionModal, ProvisionResultsModal } from './components/ProvisionModal';

export default function Packages() {
  const p = usePackages();

  if (p.loading) return <PageSpinner />;

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
          onClick={p.openInstall}
          disabled={p.restarting}
        >
          Install Package
        </Button>
      </div>

      {p.restarting && (
        <div className="badge badge-warn" style={{ marginBottom: 16, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content' }}>
          <span style={{ fontSize: 13 }}>⟳ Server is restarting — refreshing package list…</span>
        </div>
      )}

      <PackageList
        packages={p.packages}
        restarting={p.restarting}
        onUpdate={p.openUpdate}
        onUninstall={p.openUninstall}
      />

      <InstallModal
        open={p.installOpen}
        installing={p.installing}
        installMode={p.installMode}
        pipSource={p.pipSource}
        selectedFile={p.selectedFile}
        installLogs={p.installLogs}
        fileRef={p.fileRef}
        onClose={p.closeInstall}
        onModeChange={p.setInstallMode}
        onPipSourceChange={p.setPipSource}
        onFileChange={p.setSelectedFile}
        onInstall={p.handleInstall}
      />

      <UninstallModal
        target={p.uninstallTarget}
        force={p.forceUninstall}
        uninstalling={p.uninstalling}
        onForceChange={p.setForceUninstall}
        onClose={p.closeUninstall}
        onConfirm={p.handleUninstall}
      />

      <UpdateModal
        target={p.updateTarget}
        checkState={p.checkState}
        checkResult={p.checkResult}
        updating={p.updating}
        updateLogs={p.updateLogs}
        linkSource={p.linkSource}
        savingSource={p.savingSource}
        updateFileRef={p.updateFileRef}
        updateFile={p.updateFile}
        uploadUpdating={p.uploadUpdating}
        uploadUpdateResult={p.uploadUpdateResult}
        selectedVersionTag={p.selectedVersionTag}
        onClose={p.closeUpdateModal}
        onCheckUpdate={p.handleCheckUpdate}
        onSaveAndCheck={p.handleSaveAndCheck}
        onUpdateNow={p.handleUpdateNow}
        onUploadUpdate={p.handleUploadUpdate}
        onLinkSourceChange={p.setLinkSource}
        onFileChange={p.setUpdateFile}
        onVersionTagChange={p.setSelectedVersionTag}
      />

      <ProvisionModal
        data={p.provisionData && !p.provisionResults ? p.provisionData : null}
        selected={p.provisionSelected}
        ssl={p.provisionSsl}
        provisioning={p.provisioning}
        onSelectedChange={(zone, checked) => {
          p.setProvisionSelected(prev => ({ ...prev, [zone]: checked }));
          if (!checked) p.setProvisionSsl(prev => ({ ...prev, [zone]: false }));
        }}
        onSslChange={zone => p.setProvisionSsl(prev => ({ ...prev, [zone]: !prev[zone] }))}
        onProvision={p.handleProvision}
        onSkip={p.skipProvision}
      />

      <ProvisionResultsModal
        results={p.provisionResults}
        onDone={p.closeProvisionResults}
      />
    </div>
  );
}
