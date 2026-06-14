import { RefObject } from 'react';
import { Upload } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import type { InstallMode } from '../types';

interface Props {
  open: boolean;
  installing: boolean;
  installMode: InstallMode;
  pipSource: string;
  selectedFile: File | null;
  installLogs: string;
  fileRef: RefObject<HTMLInputElement>;
  onClose: () => void;
  onModeChange: (mode: InstallMode) => void;
  onPipSourceChange: (v: string) => void;
  onFileChange: (f: File | null) => void;
  onInstall: () => void;
}

export function InstallModal({
  open, installing, installMode, pipSource, selectedFile, installLogs,
  fileRef, onClose, onModeChange, onPipSourceChange, onFileChange, onInstall,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={() => { if (!installing) onClose(); }}
      title="Install Package"
      width={520}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          {installLogs ? (
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={installing}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                loading={installing}
                icon={<Upload size={13} strokeWidth={1.5} />}
                onClick={onInstall}
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
        <Button variant={installMode === 'pip' ? 'primary' : 'outline'} size="sm" onClick={() => onModeChange('pip')}>
          Pip / URL
        </Button>
        <Button variant={installMode === 'file' ? 'primary' : 'outline'} size="sm" onClick={() => onModeChange('file')}>
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
            onChange={e => onPipSourceChange(e.target.value)}
            disabled={installing}
            onKeyDown={e => { if (e.key === 'Enter') onInstall(); }}
            autoFocus
          />
        </div>
      ) : (
        <div className="field">
          <label>Package file (.whl, .tar.gz, .zip)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={installing}>
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
            onChange={e => onFileChange(e.target.files?.[0] ?? null)}
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
  );
}
