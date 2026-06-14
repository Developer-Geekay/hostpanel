import { RefObject } from 'react';
import { RefreshCw, Upload } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import type { PackageItem, CheckUpdateResult, UploadUpdateResult, CheckState } from '../types';

interface Props {
  target: PackageItem | null;
  checkState: CheckState;
  checkResult: CheckUpdateResult | null;
  updating: boolean;
  updateLogs: string;
  linkSource: string;
  savingSource: boolean;
  updateFileRef: RefObject<HTMLInputElement>;
  updateFile: File | null;
  uploadUpdating: boolean;
  uploadUpdateResult: UploadUpdateResult | null;
  selectedVersionTag: string | null;
  onClose: () => void;
  onCheckUpdate: () => void;
  onSaveAndCheck: () => void;
  onUpdateNow: () => void;
  onUploadUpdate: () => void;
  onLinkSourceChange: (v: string) => void;
  onFileChange: (f: File | null) => void;
  onVersionTagChange: (tag: string) => void;
}

export function UpdateModal({
  target, checkState, checkResult, updating, updateLogs, linkSource, savingSource,
  updateFileRef, updateFile, uploadUpdating, uploadUpdateResult, selectedVersionTag,
  onClose, onCheckUpdate, onSaveAndCheck, onUpdateNow, onUploadUpdate,
  onLinkSourceChange, onFileChange, onVersionTagChange,
}: Props) {
  const busy = updating || uploadUpdating || savingSource;

  return (
    <Modal
      open={!!target}
      onClose={busy ? () => {} : onClose}
      title={`Update — ${target?.name ?? ''}`}
      width={520}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Button>
        </div>
      }
    >
      {/* Section 1 — Check for Updates */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-3)', marginBottom: 10, fontWeight: 600 }}>
          Check for Updates
        </div>

        {(!target?.source_type || target.source_type === 'upload') && checkState === 'idle' ? (
          <div>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5 }}>
              Installed from a local file. Link a GitHub release URL or pip package name to enable future update checks.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={linkSource}
                onChange={e => onLinkSourceChange(e.target.value)}
                placeholder="https://github.com/… or pip-package-name"
                disabled={savingSource}
                style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter') onSaveAndCheck(); }}
              />
              <Button variant="primary" size="sm" loading={savingSource} disabled={!linkSource.trim()} onClick={onSaveAndCheck}>
                Save & Check
              </Button>
            </div>
          </div>
        ) : checkState === 'idle' ? (
          <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />} onClick={onCheckUpdate}>
            Check for Updates
          </Button>
        ) : checkState === 'checking' ? (
          <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={13} strokeWidth={1.5} className="spin-icon" /> Checking…
          </div>
        ) : checkState === 'available' ? (
          <AvailableSection
            checkResult={checkResult}
            selectedVersionTag={selectedVersionTag}
            updating={updating}
            updateLogs={updateLogs}
            onVersionTagChange={onVersionTagChange}
            onUpdateNow={onUpdateNow}
          />
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
              onChange={e => onFileChange(e.target.files?.[0] ?? null)}
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
              <Button variant="primary" size="sm" loading={uploadUpdating} onClick={onUploadUpdate}>
                Upload & Update
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

interface AvailableSectionProps {
  checkResult: CheckUpdateResult | null;
  selectedVersionTag: string | null;
  updating: boolean;
  updateLogs: string;
  onVersionTagChange: (tag: string) => void;
  onUpdateNow: () => void;
}

function AvailableSection({ checkResult, selectedVersionTag, updating, updateLogs, onVersionTagChange, onUpdateNow }: AvailableSectionProps) {
  const versions = checkResult?.available_versions ?? [];
  const activeTag = selectedVersionTag ?? versions[0]?.tag ?? null;
  const activeVersion = versions.find(v => v.tag === activeTag) ?? versions[0];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span className="badge badge-dim" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>v{checkResult?.current_version}</span>
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>→</span>
        <span className="badge badge-ok" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>v{activeVersion?.version ?? checkResult?.latest_version}</span>
      </div>

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
                  onChange={() => onVersionTagChange(v.tag)}
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
        <Button variant="primary" size="sm" loading={updating} onClick={onUpdateNow}>
          Update to v{activeVersion.version}
        </Button>
      ) : null}
    </div>
  );
}
