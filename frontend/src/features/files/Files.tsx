import { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, File, ChevronRight, ChevronDown, Upload, FolderPlus, Pencil, Trash2, Download } from 'lucide-react';
import { apiGet, apiPost, apiDelete, apiPostMultipart, downloadUrl } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

interface FileEntry { name: string; path: string; type: 'file'|'dir'; size: number; modified: string; permissions: string; }
interface DirNode    { name: string; path: string; children?: DirNode[]; }

function formatBytes(n: number) {
  if (!n) return '—';
  const u = ['B','KB','MB','GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(i ? 1 : 0) + ' ' + u[i];
}

function TreeNode({ node, current, onSelect, expanded, onToggle }: {
  node: DirNode; current: string; onSelect(p: string): void;
  expanded: Set<string>; onToggle(p: string): void;
}) {
  const isOpen = expanded.has(node.path);
  return (
    <div>
      <div
        onClick={() => { onToggle(node.path); onSelect(node.path); }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', cursor: 'pointer',
          background: current === node.path ? 'var(--accent-dim)' : 'transparent',
          color: current === node.path ? 'var(--accent)' : 'var(--text-2)',
          borderRadius: 'var(--radius-sm)', fontSize: 12 }}
      >
        {node.children ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 12 }} />}
        <FolderOpen size={13} strokeWidth={1.5} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      </div>
      {isOpen && node.children?.map(c => (
        <div key={c.path} style={{ paddingLeft: 14 }}>
          <TreeNode node={c} current={current} onSelect={onSelect} expanded={expanded} onToggle={onToggle} />
        </div>
      ))}
    </div>
  );
}

export default function Files() {
  const { ok, err } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPath, setCurrentPath] = useState('/home');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [tree, setTree] = useState<DirNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set(['/home']));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPath, setEditorPath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorSaving, setEditorSaving] = useState(false);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [deleteTarget, setDeleteTarget] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await apiGet<{ files: FileEntry[] }>(`files/list?path=${encodeURIComponent(path)}`);
      setFiles(res.files ?? []);
      setCurrentPath(path);
    } catch { setFiles([]); } finally { setLoading(false); }
  }, []);

  const loadTree = useCallback(async () => {
    try {
      const t = await apiGet<DirNode>('files/tree?path=/home');
      setTree(t);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadTree(); loadDir('/home'); }, [loadDir, loadTree]);

  const segments = currentPath.split('/').filter(Boolean).map((p, i, arr) => ({
    label: p, path: '/' + arr.slice(0, i + 1).join('/'),
  }));

  const openEditor = async (entry: FileEntry) => {
    try {
      const res = await apiGet<{ content: string }>(`files/read?path=${encodeURIComponent(entry.path)}`);
      setEditorPath(entry.path); setEditorContent(res.content ?? ''); setEditorOpen(true);
    } catch { err('Could not read file'); }
  };

  const saveEditor = async () => {
    setEditorSaving(true);
    try {
      await apiPost('files/write', { path: editorPath, content: editorContent });
      ok('File saved'); setEditorOpen(false);
    } catch { err('Save failed'); } finally { setEditorSaving(false); }
  };

  const mkdir = async () => {
    if (!newFolder.trim()) return;
    try {
      await apiPost('files/mkdir', { path: `${currentPath}/${newFolder.trim()}` });
      ok('Folder created'); setMkdirOpen(false); setNewFolder(''); loadDir(currentPath); loadTree();
    } catch { err('Failed to create folder'); }
  };

  const deleteFile = async (path: string) => {
    try {
      await apiDelete(`files/delete?path=${encodeURIComponent(path)}`);
      ok('Deleted'); setDeleteTarget(''); loadDir(currentPath); loadTree();
    } catch { err('Delete failed'); }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const form = new FormData(); form.append('file', file); form.append('path', currentPath);
      await apiPostMultipart('files/upload', form);
      ok(`Uploaded ${file.name}`); loadDir(currentPath);
    } catch { err('Upload failed'); } finally { setUploading(false); e.target.value = ''; }
  };

  const toggleExpand = (path: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Tree sidebar */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border-2)', padding: '12px 8px', overflowY: 'auto', background: 'var(--bg-2)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', padding: '4px 8px 8px' }}>Directories</div>
        {tree ? <TreeNode node={tree} current={currentPath} onSelect={loadDir} expanded={expanded} onToggle={toggleExpand} /> : <div style={{ padding: 8, fontSize: 12, color: 'var(--text-3)' }}>Loading…</div>}
      </div>

      {/* Main */}
      <div className="page" style={{ flex: 1 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          <span onClick={() => loadDir('/')} style={{ cursor: 'pointer', color: 'var(--accent)' }}>/</span>
          {segments.map(s => (
            <span key={s.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronRight size={11} color="var(--text-3)" />
              <span onClick={() => loadDir(s.path)} style={{ cursor: 'pointer', color: 'var(--text-2)' }}>{s.label}</span>
            </span>
          ))}
        </div>

        <div className="page-header">
          <div>
            <div className="page-title">Files</div>
            <div className="page-desc" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{currentPath}</div>
          </div>
          <div className="actions">
            <Button variant="ghost" size="sm" icon={<FolderPlus size={13} strokeWidth={1.5} />} onClick={() => setMkdirOpen(true)}>New Folder</Button>
            <Button variant="ghost" size="sm" icon={<Upload size={13} strokeWidth={1.5} />} loading={uploading} onClick={() => fileInputRef.current?.click()}>Upload</Button>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={upload} />
          </div>
        </div>

        {loading ? <PageSpinner /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Size</th><th>Modified</th><th>Permissions</th><th></th></tr></thead>
              <tbody>
                {files.length === 0 && (
                  <tr><td colSpan={5}><div className="empty"><div className="empty-title">Empty directory</div></div></td></tr>
                )}
                {files.map(f => (
                  <tr key={f.path}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {f.type === 'dir'
                          ? <FolderOpen size={14} strokeWidth={1.5} color="var(--accent)" />
                          : <File size={14} strokeWidth={1.5} color="var(--text-3)" />}
                        <span
                          style={{ cursor: f.type === 'dir' ? 'pointer' : 'default', color: f.type === 'dir' ? 'var(--accent)' : 'var(--text)' }}
                          onClick={() => f.type === 'dir' && loadDir(f.path)}
                        >{f.name}</span>
                      </div>
                    </td>
                    <td className="mono">{f.type === 'file' ? formatBytes(f.size) : '—'}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{f.modified}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.permissions}</td>
                    <td>
                      <div className="actions">
                        {f.type === 'file' && <Button variant="ghost" size="sm" icon={<Pencil size={12} strokeWidth={1.5} />} onClick={() => openEditor(f)}>Edit</Button>}
                        {f.type === 'file' && <a href={downloadUrl(`files/download?path=${encodeURIComponent(f.path)}`)} download={f.name} style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm" icon={<Download size={12} strokeWidth={1.5} />} /></a>}
                        <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => setDeleteTarget(f.path)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Editor */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editorPath.split('/').pop() ?? 'Edit'} width={760}
        footer={<><Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button><Button variant="primary" loading={editorSaving} onClick={saveEditor}>Save</Button></>}>
        <textarea value={editorContent} onChange={e => setEditorContent(e.target.value)}
          style={{ width: '100%', height: 400, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', outline: 'none' }} />
      </Modal>

      {/* Mkdir */}
      <Modal open={mkdirOpen} onClose={() => setMkdirOpen(false)} title="New Folder" width={340}
        footer={<><Button variant="ghost" onClick={() => setMkdirOpen(false)}>Cancel</Button><Button variant="primary" onClick={mkdir}>Create</Button></>}>
        <div className="field"><label>Folder Name</label><input value={newFolder} onChange={e => setNewFolder(e.target.value)} onKeyDown={e => e.key === 'Enter' && mkdir()} autoFocus /></div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget('')} title="Delete File" width={340}
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget('')}>Cancel</Button><Button variant="danger" onClick={() => deleteFile(deleteTarget)}>Delete</Button></>}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Delete <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--err)' }}>{deleteTarget.split('/').pop()}</code>? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
