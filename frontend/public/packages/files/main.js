/* hostpanel-package-filemanager — frontend/main.js
 * Registered as window.__hpkg_sdk.register('files', FileManagerPlugin).
 * Adapts to HostPanel design themes using CSS variables and standard classes.
 */
(function () {
  'use strict';

  const sdk = window.__hpkg_sdk;
  const { html, useState, useEffect, useCallback, useRef } = sdk;
  const { SdkFormModal, SdkConfirmModal } = sdk.components;
  const { useApi, useToast } = sdk.hooks;

  // ── SVGs Micro-Icons matching native dashboard style ─────────────────────────
  const FolderIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style=${{ color: 'var(--accent)', flexShrink: 0 }}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"></path>
    </svg>
  `;

  const FileIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style=${{ color: 'var(--text-2)', flexShrink: 0 }}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
    </svg>
  `;

  const ZipIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style=${{ color: 'var(--ok)', flexShrink: 0 }}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.29 7 12 12 20.71 7"></polyline>
      <line x1="12" y1="22" x2="12" y2="12"></line>
    </svg>
  `;

  const ArrowUpIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="m18 15-6-6-6 6"/>
    </svg>
  `;

  const RefreshIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
      <path d="M16 16h5v5"/>
    </svg>
  `;

  const EditIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
  `;

  const DownloadIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  `;

  const UploadIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  `;

  const DeleteIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>
    </svg>
  `;

  const RenameIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="m18 5-3-3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
      <path d="M10.4 12h3.2"/>
      <path d="M12 10.4v3.2"/>
    </svg>
  `;

  const ZipActionIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="12" y1="3" x2="12" y2="21"></line>
      <line x1="3" y1="12" x2="21" y2="12"></line>
    </svg>
  `;

  const CutIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="20" r="2"/><circle cx="6" cy="4" r="2"/>
      <line x1="6" y1="6" x2="6" y2="18"/>
      <line x1="21" y1="4" x2="6" y2="18"/>
      <line x1="21" y1="20" x2="6" y2="6"/>
    </svg>
  `;

  const CopyIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;

  const PasteIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
    </svg>
  `;

  const PermissionsIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  `;

  // ── Dynamic Ace Editor Loader & Component ────────────────────────────────────
  function loadAce(callback) {
    if (window.ace) {
      callback();
      return;
    }
    const script = document.createElement('script');
    script.src = '/packages/files/ace.js';
    script.onload = () => {
      window.ace.config.set('basePath', '/packages/files/');
      window.ace.config.set('modePath', '/packages/files/');
      window.ace.config.set('themePath', '/packages/files/');
      window.ace.config.set('useWorker', false);
      callback();
    };
    script.onerror = () => console.error('Failed to load Ace editor from /packages/files/ace.js');
    document.head.appendChild(script);
  }

  function AceEditor({ path, content, onSave, onClose }) {
    const containerRef = useRef(null);
    const editorRef = useRef(null);
    const aceNodeRef = useRef(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
      loadAce(() => {
        if (!containerRef.current) return;
        const aceNode = document.createElement('div');
        aceNode.style.cssText = 'width:100%;height:100%;';
        containerRef.current.appendChild(aceNode);
        aceNodeRef.current = aceNode;

        const editor = window.ace.edit(aceNode);
        editor.setTheme("ace/theme/tomorrow_night");

        const ext = path.split('.').pop().toLowerCase();
        let mode = 'ace/mode/text';
        if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) mode = 'ace/mode/javascript';
        else if (['html', 'htm'].includes(ext)) mode = 'ace/mode/html';
        else if (['css', 'scss', 'sass'].includes(ext)) mode = 'ace/mode/css';
        else if (['json'].includes(ext)) mode = 'ace/mode/json';
        else if (['py'].includes(ext)) mode = 'ace/mode/python';
        else if (['sh', 'bash'].includes(ext)) mode = 'ace/mode/sh';
        else if (['md', 'markdown'].includes(ext)) mode = 'ace/mode/markdown';
        else if (['php'].includes(ext)) mode = 'ace/mode/php';
        else if (['xml'].includes(ext)) mode = 'ace/mode/xml';

        editor.session.setMode(mode);
        editor.setValue(content, -1);
        editor.setOptions({
          fontSize: "13px",
          fontFamily: "var(--font-mono)",
          showPrintMargin: false,
        });

        editorRef.current = editor;
        setLoaded(true);
      });

      return () => {
        if (editorRef.current) {
          editorRef.current.destroy();
          editorRef.current = null;
        }
        if (aceNodeRef.current) {
          aceNodeRef.current.remove();
          aceNodeRef.current = null;
        }
      };
    }, [path, content]);

    const handleSave = () => {
      if (editorRef.current) onSave(editorRef.current.getValue());
    };

    return html`
      <div style=${{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column', padding: '20px'
      }}>
        <div class="card" style=${{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border-2)', background: 'var(--bg-3)' }}>
            <div>
              <span style=${{ fontSize: 13, fontWeight: 600 }}>Editing file</span>
              <div style=${{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>${path}</div>
            </div>
            <div style=${{ display: 'flex', gap: 8 }}>
              <button class="btn btn-ghost btn-sm" onClick=${onClose}>Close</button>
              <button class="btn btn-primary btn-sm" onClick=${handleSave}>Save</button>
            </div>
          </div>
          <div ref=${containerRef} style=${{ flex: 1, width: '100%', height: '100%', background: '#1d1f21' }}>
            ${!loaded && html`<div style=${{ color: 'var(--text-2)', padding: 20 }}>Loading Ace Editor…</div>`}
          </div>
        </div>
      </div>
    `;
  }

  // ── Recursive Folder Node Component ──────────────────────────────────────────
  function FolderNode({ node, currentPath, onSelectPath }) {
    const isOnPath = currentPath === node.path || currentPath.startsWith(node.path + '/');
    const [expanded, setExpanded] = useState(isOnPath);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = currentPath === node.path;

    useEffect(() => {
      if (currentPath === node.path || currentPath.startsWith(node.path + '/')) {
        setExpanded(true);
      }
    }, [currentPath]);

    const handleToggle = (e) => { e.stopPropagation(); setExpanded(!expanded); };
    const handleSelect = (e) => { e.stopPropagation(); onSelectPath(node.path); };

    return html`
      <div style=${{ marginLeft: 12 }}>
        <div
          style=${{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            background: isSelected ? 'var(--accent-dim)' : 'transparent',
            color: isSelected ? 'var(--accent)' : 'var(--text)', marginBottom: 2
          }}
          onClick=${handleSelect}
        >
          ${hasChildren
            ? html`<span onClick=${handleToggle} style=${{ display: 'inline-flex', width: 12, cursor: 'pointer', userSelect: 'none', fontSize: 9 }}>${expanded ? '▼' : '▶'}</span>`
            : html`<span style=${{ display: 'inline-flex', width: 12 }}></span>`
          }
          <${FolderIcon} />
          <span style=${{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${node.name}</span>
        </div>
        ${expanded && hasChildren && html`
          <div style=${{ borderLeft: '1px solid var(--border-2)', marginLeft: 6 }}>
            ${node.children.map(child => html`
              <${FolderNode} key=${child.path} node=${child} currentPath=${currentPath} onSelectPath=${onSelectPath} />
            `)}
          </div>
        `}
      </div>
    `;
  }

  // ── Breadcrumbs component ─────────────────────────────────────────────────────
  function Breadcrumbs({ path, onNavigate }) {
    const parts = path.split('/').filter(Boolean);
    const handleClick = (index) => {
      const targetPath = '/' + parts.slice(0, index + 1).join('/');
      onNavigate(targetPath);
    };
    return html`
      <div style=${{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
        <span style=${{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 500 }} onClick=${() => onNavigate(parts[0] === 'home' ? '/home' : '/')}>
          Home
        </span>
        ${parts.map((part, index) => html`
          <span key=${index} style=${{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style=${{ color: 'var(--text-3)' }}>/</span>
            <span
              style=${{
                cursor: index === parts.length - 1 ? 'default' : 'pointer',
                color: index === parts.length - 1 ? 'var(--text)' : 'var(--accent)',
                fontWeight: index === parts.length - 1 ? 600 : 400
              }}
              onClick=${() => index !== parts.length - 1 && handleClick(index)}
            >${part}</span>
          </span>
        `)}
      </div>
    `;
  }

  // ── Selection Toolbar (shown when ≥1 item selected) ──────────────────────────
  function SelectionToolbar({ count, selectedFile, currentPath, onClear, onDelete, onRename, onEdit, onCompress, onExtract }) {
    const isFile = selectedFile && selectedFile.type === 'file';
    const isZip = selectedFile && selectedFile.name.toLowerCase().endsWith('.zip');
    const sep = html`<span style=${{ width: 1, height: 18, background: 'var(--border-2)', display: 'inline-block', margin: '0 2px' }}></span>`;

    return html`
      <div style=${{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '7px 12px', marginBottom: 10,
        background: 'var(--accent-dim)', border: '1px solid var(--accent)',
        borderRadius: 'var(--radius)', fontSize: 12,
      }}>
        <span style=${{ fontWeight: 600, color: 'var(--accent)', marginRight: 2 }}>
          ${count} item${count > 1 ? 's' : ''} selected
        </span>
        <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11, padding: '2px 7px' }} onClick=${onClear}>✕ Clear</button>
        ${sep}
        ${count === 1 && isFile && html`
          <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} title="Edit file" onClick=${() => onEdit(selectedFile)}>
            Edit
          </button>
          <a
            class="btn btn-ghost btn-sm" style=${{ fontSize: 11, textDecoration: 'none' }}
            title="Download file"
            href=${'/cpanelapi/files/download?path=' + encodeURIComponent(currentPath + '/' + selectedFile.name) + '&token=' + encodeURIComponent(localStorage.getItem('auth_token') ?? '')}
            download
          >Download</a>
        `}
        ${count === 1 && html`
          <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} title="Rename" onClick=${() => onRename(selectedFile)}>Rename</button>
        `}
        <button
          class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }}
          title="Compress to zip"
          onClick=${() => onCompress()}
        >Compress</button>
        ${count === 1 && isZip && html`
          <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} title="Extract zip" onClick=${() => onExtract(selectedFile)}>Extract</button>
        `}
        <div style=${{ flex: 1 }}></div>
        <button class="btn btn-danger btn-sm" style=${{ fontSize: 11 }} onClick=${onDelete}>
          Delete${count > 1 ? ' (' + count + ')' : ''}
        </button>
      </div>
    `;
  }

  // ── Extract Modal (custom, pre-filled destination) ────────────────────────────
  function ExtractModal({ file, defaultPath, onClose, onSubmit }) {
    const [destDir, setDestDir] = useState(defaultPath);
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!destDir.trim()) return;
      setBusy(true);
      try { await onSubmit(destDir.trim()); }
      finally { setBusy(false); }
    };

    return html`
      <div style=${{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div class="card" style=${{ width: '100%', maxWidth: 480, padding: 24 }}>
          <h3 style=${{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Extract Zip Archive</h3>
          <p style=${{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>${file.name}</p>
          <form onSubmit=${handleSubmit}>
            <label style=${{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Destination Folder</label>
            <input
              class="input"
              type="text"
              value=${destDir}
              onInput=${(e) => setDestDir(e.target.value)}
              required
              style=${{ width: '100%', marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 12, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" class="btn btn-ghost btn-sm" onClick=${onClose} disabled=${busy}>Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm" disabled=${busy}>${busy ? 'Extracting…' : 'Extract'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // ── Chmod Modal ───────────────────────────────────────────────────────────────
  function parsePerms(str) {
    // str like "-rwxr-xr-x" or "drwxr-xr-x", we read chars 1-9
    const s = (str || '---------').padEnd(10, '-');
    return {
      ur: s[1] === 'r', uw: s[2] === 'w', ux: s[3] === 'x',
      gr: s[4] === 'r', gw: s[5] === 'w', gx: s[6] === 'x',
      or: s[7] === 'r', ow: s[8] === 'w', ox: s[9] === 'x',
    };
  }
  function permsToOctal(p) {
    return ((p.ur?4:0)+(p.uw?2:0)+(p.ux?1:0)) * 64
         + ((p.gr?4:0)+(p.gw?2:0)+(p.gx?1:0)) * 8
         + ((p.or?4:0)+(p.ow?2:0)+(p.ox?1:0));
  }
  function octalStr(n) {
    return n.toString(8).padStart(3, '0');
  }

  function ChmodModal({ file, currentPath, onClose, onDone }) {
    const [perms, setPerms] = useState(() => parsePerms(file.permissions));
    // Separate state for the text input so it doesn't snap back while the user is typing
    const [octalInput, setOctalInput] = useState(() => octalStr(permsToOctal(parsePerms(file.permissions))));
    const [busy, setBusy] = useState(false);
    const { ok, err: toastErr } = useToast();

    const toggle = (key) => {
      const next = { ...perms, [key]: !perms[key] };
      setPerms(next);
      setOctalInput(octalStr(permsToOctal(next)));
    };
    const octal = octalStr(permsToOctal(perms));

    const handleOctalInput = (e) => {
      const val = e.target.value.replace(/[^0-7]/g, '').slice(0, 3);
      setOctalInput(val); // let the user type freely
      if (val.length === 3) {
        const n = parseInt(val, 8);
        setPerms({
          ur: !!(n & 0o400), uw: !!(n & 0o200), ux: !!(n & 0o100),
          gr: !!(n & 0o040), gw: !!(n & 0o020), gx: !!(n & 0o010),
          or: !!(n & 0o004), ow: !!(n & 0o002), ox: !!(n & 0o001),
        });
      }
    };

    const handleSave = async () => {
      setBusy(true);
      try {
        await sdk.fetch('POST', '/cpanelapi/filemanager/chmod', {
          path: currentPath + '/' + file.name,
          mode: permsToOctal(perms),
        });
        ok('Permissions updated');
        onDone();
      } catch(e) {
        toastErr(e.message || 'chmod failed');
      } finally {
        setBusy(false);
      }
    };

    const Row = ({ label, rKey, wKey, xKey }) => html`
      <tr>
        <td style=${{ padding: '6px 12px 6px 0', fontSize: 13, color: 'var(--text-2)', width: 70 }}>${label}</td>
        ${['r', 'w', 'x'].map((bit, i) => {
          const key = [rKey, wKey, xKey][i];
          return html`
            <td style=${{ textAlign: 'center', padding: '6px 8px' }}>
              <input type="checkbox" checked=${perms[key]} onChange=${() => toggle(key)}
                style=${{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }} />
            </td>
          `;
        })}
      </tr>
    `;

    return html`
      <div style=${{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div class="card" style=${{ width: '100%', maxWidth: 380, padding: 24 }}>
          <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style=${{ margin: '0 0 3px', fontSize: 15, fontWeight: 600 }}>Change Permissions</h3>
              <p style=${{ margin: 0, fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>${file.name}</p>
            </div>
            <button class="btn btn-ghost btn-sm" style=${{ padding: '2px 6px', fontSize: 16 }} onClick=${onClose}>×</button>
          </div>

          <table style=${{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead>
              <tr>
                <th style=${{ padding: '4px 12px 8px 0', textAlign: 'left', fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}></th>
                ${['Read', 'Write', 'Execute'].map(h => html`
                  <th style=${{ padding: '4px 8px 8px', textAlign: 'center', fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>${h}</th>
                `)}
              </tr>
            </thead>
            <tbody>
              <${Row} label="Owner" rKey="ur" wKey="uw" xKey="ux" />
              <${Row} label="Group" rKey="gr" wKey="gw" xKey="gx" />
              <${Row} label="Others" rKey="or" wKey="ow" xKey="ox" />
            </tbody>
          </table>

          <div style=${{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <label style=${{ fontSize: 12, color: 'var(--text-2)' }}>Octal:</label>
            <input class="input" type="text" value=${octalInput} maxLength=${3} onInput=${handleOctalInput}
              style=${{ width: 70, fontFamily: 'var(--font-mono)', fontSize: 14, textAlign: 'center', letterSpacing: 3 }} />
            <span style=${{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
              (${['','',''].map((_,i) => {
                const bits = [['ur','uw','ux'],['gr','gw','gx'],['or','ow','ox']][i];
                return (perms[bits[0]]?'r':'-') + (perms[bits[1]]?'w':'-') + (perms[bits[2]]?'x':'-');
              }).join('')})
            </span>
          </div>

          <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button class="btn btn-ghost btn-sm" onClick=${onClose} disabled=${busy}>Cancel</button>
            <button class="btn btn-primary btn-sm" onClick=${handleSave} disabled=${busy}>
              ${busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Root Plugin component ─────────────────────────────────────────────────────
  function FileManagerPlugin() {
    const { ok, err: toastErr } = useToast();
    const isAdmin = localStorage.getItem('user_role') === 'admin';
    const homeDir = '/home/' + (localStorage.getItem('username') ?? '');
    const rootPath = isAdmin ? '/home' : homeDir;

    const [currentPath, setCurrentPath] = useState(rootPath);
    const [editorFile, setEditorFile]   = useState(null);
    const [viewerFile, setViewerFile]   = useState(null);

    // ── Selection state ─────────────────────────────────────────────────────────
    const [selectedNames, setSelectedNames] = useState(new Set());
    const [lastClickIdx, setLastClickIdx]   = useState(-1);
    const [hoveredName, setHoveredName]     = useState(null);

    // ── Modal targets ───────────────────────────────────────────────────────────
    const [mkdirOpen, setMkdirOpen]       = useState(false);
    const [mkfileOpen, setMkfileOpen]     = useState(false);
    const [renameTarget, setRenameTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);   // single item
    const [deleteTargets, setDeleteTargets] = useState(null); // multiple items
    const [zipTarget, setZipTarget]       = useState(null);
    const [unzipTarget, setUnzipTarget]   = useState(null);
    const [chmodTarget, setChmodTarget]   = useState(null);
    // clipboard: { items: [{name, type}], srcDir: string, mode: 'cut'|'copy' } | null
    const [clipboard, setClipboard]       = useState(null);

    const fileInputRef = useRef(null);
    const [localFiles, setLocalFiles] = useState(null);

    // ── Data fetching ───────────────────────────────────────────────────────────
    const { data: treeData, loading: treeLoading, refetch: refetchTree } = useApi(
      () => sdk.fetch('GET', '/cpanelapi/files/tree?path=' + encodeURIComponent(rootPath)),
      [rootPath]
    );
    const { data: filesData, loading: filesLoading, refetch: refetchFiles } = useApi(
      () => sdk.fetch('GET', '/cpanelapi/files/list?path=' + encodeURIComponent(currentPath)),
      [currentPath]
    );

    // Sync localFiles from API data (source of truth after each fetch)
    useEffect(() => {
      if (filesData !== null) setLocalFiles(filesData);
    }, [filesData]);

    // Clear selection and local cache whenever the directory changes
    useEffect(() => {
      setSelectedNames(new Set());
      setLastClickIdx(-1);
      setLocalFiles(null);
    }, [currentPath]);

    // ── Navigation ──────────────────────────────────────────────────────────────
    const handleGoUp = () => {
      if (currentPath === rootPath || currentPath === '/') return;
      const parts = currentPath.split('/').filter(Boolean);
      parts.pop();
      setCurrentPath('/' + parts.join('/'));
    };

    // ── File open/edit/save ─────────────────────────────────────────────────────
    const handleViewFile = async (file) => {
      const filePath = currentPath + '/' + file.name;
      try {
        const res = await sdk.fetch('GET', '/cpanelapi/files/read?path=' + encodeURIComponent(filePath));
        setViewerFile({ path: filePath, content: res.content });
      } catch (err) {
        toastErr(err.message || 'Could not read file');
      }
    };

    const handleOpenFile = async (file) => {
      const filePath = currentPath + '/' + file.name;
      try {
        const res = await sdk.fetch('GET', '/cpanelapi/files/read?path=' + encodeURIComponent(filePath));
        setEditorFile({ path: filePath, content: res.content });
      } catch (err) {
        toastErr(err.message || 'Could not open file');
      }
    };

    const handleSaveFile = async (newContent) => {
      if (!editorFile) return;
      try {
        await sdk.fetch('POST', '/cpanelapi/files/write', { path: editorFile.path, content: newContent });
        ok('File saved successfully');
        setEditorFile(null);
        refetchFiles();
      } catch (err) {
        toastErr(err.message || 'Could not save file');
      }
    };

    // ── Upload ──────────────────────────────────────────────────────────────────
    const handleUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('path', currentPath);
      formData.append('file', file);
      try {
        ok('Uploading ' + file.name + '...');
        const token = localStorage.getItem('auth_token') ?? '';
        const response = await fetch('/cpanelapi/files/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: formData,
        });
        if (!response.ok) throw new Error(await response.text());
        ok('Uploaded ' + file.name + ' successfully!');
        refetchFiles();
        refetchTree();
      } catch (err) {
        toastErr(err.message || 'Upload failed');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    // ── Row selection logic ─────────────────────────────────────────────────────
    const handleRowClick = (file, idx, e) => {
      // Don't trigger selection when clicking action buttons inside the row
      if (e.target.closest('button, a')) return;
      // Second click of a double-click — let onDoubleClick handle navigation
      if (e.detail >= 2) return;

      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd: toggle individual item
        const next = new Set(selectedNames);
        if (next.has(file.name)) next.delete(file.name);
        else next.add(file.name);
        setSelectedNames(next);
        setLastClickIdx(idx);
      } else if (e.shiftKey && lastClickIdx >= 0) {
        // Shift: range select from last clicked
        const files = filesData || [];
        const start = Math.min(lastClickIdx, idx);
        const end   = Math.max(lastClickIdx, idx);
        const next  = new Set(selectedNames);
        for (let i = start; i <= end; i++) next.add(files[i].name);
        setSelectedNames(next);
      } else {
        // Plain click: select only this item (deselect if already the only one)
        if (selectedNames.size === 1 && selectedNames.has(file.name)) {
          setSelectedNames(new Set());
          setLastClickIdx(-1);
        } else {
          setSelectedNames(new Set([file.name]));
          setLastClickIdx(idx);
        }
      }
    };

    // Double-click: navigate into folder OR open file viewer
    const handleRowDblClick = (file) => {
      if (file.type === 'dir') {
        setSelectedNames(new Set());
        setCurrentPath(currentPath + '/' + file.name);
      } else {
        handleViewFile(file);
      }
    };

    // Header checkbox: toggle select-all / deselect-all
    const handleSelectAll = () => {
      if (!localFiles?.length) return;
      if (selectedNames.size === localFiles.length) {
        setSelectedNames(new Set());
      } else {
        setSelectedNames(new Set(localFiles.map(f => f.name)));
      }
    };

    // ── Selection toolbar actions ───────────────────────────────────────────────
    const handleToolbarDelete = () => {
      const targets = (localFiles || []).filter(f => selectedNames.has(f.name));
      if (targets.length === 1) setDeleteTarget(targets[0]);
      else if (targets.length > 1) setDeleteTargets(targets);
    };

    const handleToolbarCompress = () => {
      const selected = (localFiles || []).filter(f => selectedNames.has(f.name));
      setZipTarget(selected.length === 1 ? selected[0] : { name: 'archive', _multi: selected });
    };

    const handleCut = () => {
      const items = (localFiles || []).filter(f => selectedNames.has(f.name));
      if (!items.length) return;
      setClipboard({ items, srcDir: currentPath, mode: 'cut' });
      ok(`Cut ${items.length} item${items.length > 1 ? 's' : ''}`);
      setSelectedNames(new Set());
    };

    const handleCopy = () => {
      const items = (localFiles || []).filter(f => selectedNames.has(f.name));
      if (!items.length) return;
      setClipboard({ items, srcDir: currentPath, mode: 'copy' });
      ok(`Copied ${items.length} item${items.length > 1 ? 's' : ''} to clipboard`);
      setSelectedNames(new Set());
    };

    const handlePaste = async () => {
      if (!clipboard) return;
      const { items, srcDir, mode } = clipboard;
      const paths = items.map(f => srcDir + '/' + f.name);
      const endpoint = mode === 'cut' ? '/cpanelapi/filemanager/move' : '/cpanelapi/filemanager/copy';
      try {
        await sdk.fetch('POST', endpoint, { paths, dest_dir: currentPath });
        ok(`${mode === 'cut' ? 'Moved' : 'Copied'} ${items.length} item${items.length > 1 ? 's' : ''} here`);
        if (mode === 'cut') setClipboard(null);
        refetchFiles();
        refetchTree();
      } catch (e) {
        toastErr(e.message || `${mode === 'cut' ? 'Move' : 'Copy'} failed`);
      }
    };

    // ── Render ──────────────────────────────────────────────────────────────────
    const allSelected = !!(localFiles?.length && selectedNames.size === localFiles.length);
    const someSelected = selectedNames.size > 0 && !allSelected;
    const singleSelected = selectedNames.size === 1
      ? (localFiles || []).find(f => selectedNames.has(f.name)) ?? null
      : null;

    return html`
      <div class="page">

        <!-- Page Header -->
        <div class="page-header">
          <div>
            <h1 class="page-title">File Manager</h1>
            <p class="page-desc">Browse, edit, and compress files on your server</p>
          </div>
        </div>

        <!-- Full-width nav bar above both panels -->
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10, minHeight: 32 }}>

          <!-- Left: breadcrumbs when nothing selected, selection actions otherwise -->
          <div style=${{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            ${selectedNames.size > 0 ? html`
              <span style=${{ fontWeight: 600, color: 'var(--accent)', fontSize: 13 }}>
                ${selectedNames.size} item${selectedNames.size > 1 ? 's' : ''} selected
              </span>
              <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} onClick=${() => { setSelectedNames(new Set()); setLastClickIdx(-1); }}>✕ Clear</button>
              <span style=${{ width: 1, height: 16, background: 'var(--border-2)', display: 'inline-block', margin: '0 2px' }}></span>
              ${selectedNames.size === 1 && singleSelected?.type === 'file' && html`
                <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} onClick=${() => handleOpenFile(singleSelected)}>Edit</button>
                <a class="btn btn-ghost btn-sm" style=${{ fontSize: 11, textDecoration: 'none' }}
                  href=${'/cpanelapi/files/download?path=' + encodeURIComponent(currentPath + '/' + singleSelected.name) + '&token=' + encodeURIComponent(localStorage.getItem('auth_token') ?? '')}
                  download onClick=${(e) => e.stopPropagation()}>Download</a>
              `}
              ${selectedNames.size === 1 && html`
                <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} onClick=${() => setRenameTarget(singleSelected)}>Rename</button>
                <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} onClick=${() => setChmodTarget(singleSelected)}>Permissions</button>
              `}
              <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} onClick=${handleCut}>Cut</button>
              <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} onClick=${handleCopy}>Copy</button>
              <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }}
                onClick=${handleToolbarCompress}>Compress</button>
              ${selectedNames.size === 1 && singleSelected?.name?.toLowerCase().endsWith('.zip') && html`
                <button class="btn btn-ghost btn-sm" style=${{ fontSize: 11 }} onClick=${() => setUnzipTarget(singleSelected)}>Extract</button>
              `}
              <button class="btn btn-danger btn-sm" style=${{ fontSize: 11 }} onClick=${handleToolbarDelete}>
                Delete${selectedNames.size > 1 ? ' (' + selectedNames.size + ')' : ''}
              </button>
            ` : html`
              <${Breadcrumbs} path=${currentPath} onNavigate=${setCurrentPath} />
            `}
          </div>

          <!-- Right: always-visible navigation + upload buttons -->
          <div style=${{ display: 'flex', gap: 6 }}>
            ${clipboard && html`
              <button
                class="btn btn-ghost btn-sm"
                style=${{ fontSize: 11, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                title=${'Paste ' + clipboard.items.length + ' item(s) here (' + clipboard.mode + ')'}
                onClick=${handlePaste}
              >
                <${PasteIcon} /> Paste${clipboard.items.length > 1 ? ' (' + clipboard.items.length + ')' : ''}
              </button>
              <button
                class="btn btn-ghost btn-sm"
                style=${{ fontSize: 11, padding: '2px 6px' }}
                title="Clear clipboard"
                onClick=${() => setClipboard(null)}
              >✕</button>
            `}
            <button class="btn btn-ghost btn-sm" title="Go Up" onClick=${handleGoUp} disabled=${currentPath === rootPath || currentPath === '/'}>
              <${ArrowUpIcon} /> Up
            </button>
            <button class="btn btn-ghost btn-sm" title="Refresh" onClick=${() => { refetchFiles(); refetchTree(); }}>
              <${RefreshIcon} /> Refresh
            </button>
            <button class="btn btn-ghost btn-sm" onClick=${() => setMkfileOpen(true)}>+ New File</button>
            <button class="btn btn-ghost btn-sm" onClick=${() => setMkdirOpen(true)}>+ New Folder</button>
            <button class="btn btn-primary btn-sm" onClick=${() => fileInputRef.current?.click()}>
              <${UploadIcon} /> Upload
            </button>
            <input type="file" ref=${fileInputRef} style=${{ display: 'none' }} onChange=${handleUpload} />
          </div>
        </div>

        <!-- Sidebar tree + Explorer flex grid -->
        <div style=${{ display: 'flex', gap: 20, alignItems: 'stretch' }}>

          <!-- Folder Tree sidebar -->
          <div class="card" style=${{ width: 250, flexShrink: 0, padding: '16px 12px', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column' }}>
            <span style=${{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.08em', marginBottom: 12, paddingLeft: 12 }}>
              Folder Tree
            </span>
            <div style=${{ flex: 1, overflowY: 'auto', maxHeight: '65vh' }}>
              ${treeLoading
                ? html`<div style=${{ color: 'var(--text-3)', fontSize: 12, paddingLeft: 12 }}>Loading tree…</div>`
                : treeData
                  ? html`<${FolderNode} node=${treeData} currentPath=${currentPath} onSelectPath=${setCurrentPath} />`
                  : html`<div style=${{ color: 'var(--text-3)', fontSize: 12, paddingLeft: 12 }}>No directories</div>`
              }
            </div>
          </div>

          <!-- Main Files panel -->
          <div class="card" style=${{ flex: 1, padding: '16px 20px', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column' }}>

            <!-- Directory listing table -->
            ${(filesLoading && !localFiles)
              ? html`<div style=${{ color: 'var(--text-2)', fontSize: 13, padding: 20 }}>Loading files…</div>`
              : !localFiles?.length
                ? html`
                    <div class="empty">
                      <div class="empty-title">This folder is empty</div>
                      <div class="empty-desc">Create files or folders to populate this directory.</div>
                    </div>
                  `
                : html`
                    <div class="table-wrap">
                      <table style=${{ tableLayout: 'fixed', width: '100%' }}>
                        <thead>
                          <tr>
                            <th style=${{ width: 36 }}>
                              <input
                                type="checkbox"
                                checked=${allSelected}
                                ref=${(el) => { if (el) el.indeterminate = someSelected; }}
                                onChange=${handleSelectAll}
                                title="Select all"
                              />
                            </th>
                            <th>Name</th>
                            <th style=${{ width: 80 }}>Size</th>
                            <th style=${{ width: 110 }}>Modified</th>
                            <th style=${{ width: 110 }}>Permissions</th>
                            <th style=${{ width: 140, textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${localFiles.map((file, idx) => {
                            const isSelected = selectedNames.has(file.name);
                            const isHovered  = hoveredName === file.name;
                            const isFolder   = file.type === 'dir';
                            const isZip      = file.name.toLowerCase().endsWith('.zip');
                            const icon       = isFolder ? html`<${FolderIcon} />` : isZip ? html`<${ZipIcon} />` : html`<${FileIcon} />`;
                            const showActions = isHovered || isSelected;

                            return html`
                              <tr
                                key=${file.name}
                                style=${{
                                  background: isSelected ? 'var(--accent-dim)' : 'transparent',
                                  outline: isSelected ? '1px solid var(--accent)' : 'none',
                                  outlineOffset: '-1px',
                                  cursor: 'default',
                                  userSelect: 'none',
                                  transition: 'background 0.1s',
                                }}
                                onClick=${(e) => handleRowClick(file, idx, e)}
                                onDoubleClick=${() => handleRowDblClick(file)}
                                onMouseEnter=${() => setHoveredName(file.name)}
                                onMouseLeave=${() => setHoveredName(null)}
                              >
                                <!-- Checkbox -->
                                <td style=${{ width: 36, textAlign: 'center' }} onClick=${(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked=${isSelected}
                                    onChange=${(e) => {
                                      e.stopPropagation();
                                      const next = new Set(selectedNames);
                                      if (isSelected) next.delete(file.name);
                                      else next.add(file.name);
                                      setSelectedNames(next);
                                    }}
                                  />
                                </td>

                                <!-- Name -->
                                <td>
                                  <div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    ${icon}
                                    <span style=${{ fontWeight: isFolder ? 500 : 400, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      ${file.name}
                                    </span>
                                    ${isFolder && html`
                                      <span style=${{ fontSize: 10, color: 'var(--text-3)', marginLeft: 2 }} title="Double-click to open">↵</span>
                                    `}
                                  </div>
                                </td>

                                <!-- Size / Modified / Permissions -->
                                <td class="mono" style=${{ color: 'var(--text-2)', fontSize: 12 }}>${file.size}</td>
                                <td style=${{ color: 'var(--text-2)', fontSize: 12 }}>${file.modified}</td>
                                <td class="mono" style=${{ color: 'var(--text-3)', fontSize: 12 }}>${file.permissions}</td>

                                <!-- Per-row action buttons (visible on hover or selection) -->
                                <td style=${{ textAlign: 'right' }}>
                                  <div style=${{
                                    display: 'flex', gap: 4, justifyContent: 'flex-end',
                                    opacity: showActions ? 1 : 0,
                                    pointerEvents: showActions ? 'auto' : 'none',
                                    transition: 'opacity 0.12s',
                                  }}>
                                    ${!isFolder && html`
                                      <button class="btn btn-ghost btn-sm" style=${{ padding: 4 }} title="Edit File" onClick=${(e) => { e.stopPropagation(); handleOpenFile(file); }}>
                                        <${EditIcon} />
                                      </button>
                                      <a
                                        class="btn btn-ghost btn-sm" style=${{ padding: 4 }}
                                        title="Download File"
                                        href=${'/cpanelapi/files/download?path=' + encodeURIComponent(currentPath + '/' + file.name) + '&token=' + encodeURIComponent(localStorage.getItem('auth_token') ?? '')}
                                        download
                                        onClick=${(e) => e.stopPropagation()}
                                      >
                                        <${DownloadIcon} />
                                      </a>
                                    `}
                                    ${isZip && html`
                                      <button class="btn btn-ghost btn-sm" style=${{ padding: '4px 6px', fontSize: 11 }} title="Extract zip" onClick=${(e) => { e.stopPropagation(); setUnzipTarget(file); }}>
                                        Extract
                                      </button>
                                    `}
                                    <button class="btn btn-ghost btn-sm" style=${{ padding: 4 }} title="Compress (Zip)" onClick=${(e) => { e.stopPropagation(); setZipTarget(file); }}>
                                      <${ZipActionIcon} />
                                    </button>
                                    <button class="btn btn-ghost btn-sm" style=${{ padding: 4 }} title="Rename" onClick=${(e) => { e.stopPropagation(); setRenameTarget(file); }}>
                                      <${RenameIcon} />
                                    </button>
                                    <button class="btn btn-ghost btn-sm" style=${{ padding: 4 }} title="Permissions (chmod)" onClick=${(e) => { e.stopPropagation(); setChmodTarget(file); }}>
                                      <${PermissionsIcon} />
                                    </button>
                                    <button class="btn btn-danger btn-sm" style=${{ padding: 4 }} title="Delete" onClick=${(e) => { e.stopPropagation(); setDeleteTarget(file); }}>
                                      <${DeleteIcon} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            `;
                          })}
                        </tbody>
                      </table>
                    </div>
                  `
            }

            <!-- Hint bar -->
            ${localFiles?.length > 0 && html`
              <div style=${{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
                Click to select · Ctrl+click to multi-select · Shift+click to range select · Double-click to open/navigate
              </div>
            `}

          </div>
        </div>

        <!-- ── OVERLAYS & MODALS ─────────────────────────────────────────────── -->

        <!-- Read-only File Viewer -->
        ${viewerFile && !editorFile && html`
          <div style=${{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', padding: 20 }}>
            <div class="card" style=${{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border-2)', background: 'var(--bg-3)' }}>
                <div>
                  <span style=${{ fontSize: 13, fontWeight: 600 }}>Viewing file</span>
                  <div style=${{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>${viewerFile.path}</div>
                </div>
                <div style=${{ display: 'flex', gap: 8 }}>
                  <button class="btn btn-ghost btn-sm" onClick=${() => setViewerFile(null)}>Close</button>
                  <button class="btn btn-primary btn-sm" onClick=${() => { setEditorFile(viewerFile); setViewerFile(null); }}>Edit</button>
                </div>
              </div>
              <pre style=${{ flex: 1, overflow: 'auto', padding: '16px 20px', margin: 0, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, background: '#1d1f21', color: '#c5c8c6', whiteSpace: 'pre', tabSize: 2, wordBreak: 'break-all' }}>${viewerFile.content}</pre>
            </div>
          </div>
        `}

        <!-- Ace Text Editor -->
        ${editorFile && html`
          <${AceEditor}
            path=${editorFile.path}
            content=${editorFile.content}
            onClose=${() => setEditorFile(null)}
            onSave=${handleSaveFile}
          />
        `}

        <!-- New Folder -->
        ${mkdirOpen && html`
          <${SdkFormModal}
            open=${true}
            title="Create Directory"
            fields=${[{ key: 'name', label: 'Directory Name', type: 'text', required: true, placeholder: 'my-folder' }]}
            onClose=${() => setMkdirOpen(false)}
            onSubmit=${async (values) => {
              await sdk.fetch('POST', '/cpanelapi/files/mkdir', { path: currentPath + '/' + values.name });
              setMkdirOpen(false);
              refetchFiles(); refetchTree();
              ok('Folder created: ' + values.name);
            }}
          />
        `}

        <!-- New File -->
        ${mkfileOpen && html`
          <${SdkFormModal}
            open=${true}
            title="Create Empty File"
            fields=${[{ key: 'name', label: 'File Name', type: 'text', required: true, placeholder: 'index.html' }]}
            onClose=${() => setMkfileOpen(false)}
            onSubmit=${async (values) => {
              const fullPath = currentPath + '/' + values.name;
              await sdk.fetch('POST', '/cpanelapi/files/write', { path: fullPath, content: '' });
              setMkfileOpen(false);
              refetchFiles();
              ok('File created: ' + values.name);
              setEditorFile({ path: fullPath, content: '' });
            }}
          />
        `}

        <!-- Rename -->
        ${renameTarget && html`
          <${SdkFormModal}
            open=${true}
            title=${'Rename — ' + renameTarget.name}
            fields=${[{ key: 'new_name', label: 'New Name', type: 'text', required: true, placeholder: renameTarget.name }]}
            onClose=${() => setRenameTarget(null)}
            onSubmit=${async (values) => {
              await sdk.fetch('POST', '/cpanelapi/filemanager/rename', {
                path: currentPath + '/' + renameTarget.name,
                new_name: values.new_name,
              });
              setRenameTarget(null);
              refetchFiles(); refetchTree();
              ok('Renamed successfully');
            }}
          />
        `}

        <!-- Compress (Zip) -->
        ${zipTarget && html`
          <${SdkFormModal}
            open=${true}
            title="Create Zip Archive"
            fields=${[{ key: 'archive_name', label: 'Archive Name', type: 'text', required: true, placeholder: zipTarget.name + '.zip' }]}
            onClose=${() => setZipTarget(null)}
            onSubmit=${async (values) => {
              const paths = zipTarget._multi
                ? zipTarget._multi.map(f => currentPath + '/' + f.name)
                : [currentPath + '/' + zipTarget.name];
              await sdk.fetch('POST', '/cpanelapi/filemanager/zip', {
                paths,
                archive_name: values.archive_name,
              });
              setZipTarget(null);
              refetchFiles();
              ok('Archive created: ' + values.archive_name);
            }}
          />
        `}

        <!-- Extract (Unzip) -->
        ${unzipTarget && html`
          <${ExtractModal}
            file=${unzipTarget}
            defaultPath=${currentPath}
            onClose=${() => setUnzipTarget(null)}
            onSubmit=${async (destDir) => {
              await sdk.fetch('POST', '/cpanelapi/filemanager/unzip', {
                archive_path: currentPath + '/' + unzipTarget.name,
                dest_dir: destDir,
              });
              setUnzipTarget(null);
              refetchFiles(); refetchTree();
              ok('Extraction completed');
            }}
          />
        `}

        <!-- Delete single item -->
        ${deleteTarget && html`
          <${SdkConfirmModal}
            open=${true}
            title="Delete Item"
            message=${'Are you sure you want to delete "' + deleteTarget.name + '"? This action is permanent and cannot be undone.'}
            danger=${true}
            onClose=${() => setDeleteTarget(null)}
            onConfirm=${async () => {
              const target = deleteTarget;
              setLocalFiles(prev => (prev || []).filter(f => f.name !== target.name));
              setDeleteTarget(null);
              setSelectedNames(prev => { const n = new Set(prev); n.delete(target.name); return n; });
              try {
                await sdk.fetch('DELETE', '/cpanelapi/files/delete?path=' + encodeURIComponent(currentPath + '/' + target.name));
                if (target.type === 'dir') refetchTree();
                ok('Deleted successfully');
              } catch (e) {
                toastErr(e.message || 'Delete failed');
                refetchFiles();
              }
            }}
          />
        `}

        <!-- Delete multiple items -->
        ${deleteTargets && html`
          <${SdkConfirmModal}
            open=${true}
            title=${'Delete ' + deleteTargets.length + ' Items'}
            message=${'Permanently delete ' + deleteTargets.length + ' selected items? This cannot be undone.'}
            danger=${true}
            onClose=${() => setDeleteTargets(null)}
            onConfirm=${async () => {
              const targets = deleteTargets;
              const names = new Set(targets.map(f => f.name));
              const hasDir = targets.some(f => f.type === 'dir');
              setLocalFiles(prev => (prev || []).filter(f => !names.has(f.name)));
              setDeleteTargets(null);
              setSelectedNames(new Set());
              let errors = 0;
              for (const file of targets) {
                try {
                  await sdk.fetch('DELETE', '/cpanelapi/files/delete?path=' + encodeURIComponent(currentPath + '/' + file.name));
                } catch { errors++; }
              }
              if (errors > 0) {
                toastErr(errors + ' item(s) could not be deleted');
                refetchFiles();
                if (hasDir) refetchTree();
              } else {
                if (hasDir) refetchTree();
                ok('Deleted ' + targets.length + ' item(s) successfully');
              }
            }}
          />
        `}

        ${chmodTarget && html`
          <${ChmodModal}
            file=${chmodTarget}
            currentPath=${currentPath}
            onClose=${() => setChmodTarget(null)}
            onDone=${() => { setChmodTarget(null); refetchFiles(); }}
          />
        `}

      </div>
    `;
  }

  window.__hpkg_sdk.register('files', FileManagerPlugin);
})();
