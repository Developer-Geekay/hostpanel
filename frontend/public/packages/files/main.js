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

  // ── Dynamic Ace Editor Loader & Component ────────────────────────────────────
  function loadAce(callback) {
    if (window.ace) {
      callback();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.7/ace.js';
    script.onload = () => callback();
    document.head.appendChild(script);
  }

  function AceEditor({ path, content, onSave, onClose }) {
    const containerRef = useRef(null);
    const editorRef = useRef(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
      loadAce(() => {
        if (!containerRef.current) return;

        const editor = window.ace.edit(containerRef.current);
        editor.setTheme("ace/theme/tomorrow_night");

        // Auto-detect mode based on file extension
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
          enableBasicAutocompletion: true,
          enableLiveAutocompletion: true
        });

        editorRef.current = editor;
        setLoaded(true);
      });

      return () => {
        if (editorRef.current) {
          editorRef.current.destroy();
        }
      };
    }, [path, content]);

    const handleSave = () => {
      if (editorRef.current) {
        onSave(editorRef.current.getValue());
      }
    };

    return html`
      <div style=${{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px'
      }}>
        <div class="card" style=${{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <!-- Editor Title & Header -->
          <div style=${{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: '12px 20px', 
            borderBottom: '1px solid var(--border-2)',
            background: 'var(--bg-3)'
          }}>
            <div>
              <span style=${{ fontSize: 13, fontWeight: 600 }}>Editing file</span>
              <div style=${{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>${path}</div>
            </div>
            <div style=${{ display: 'flex', gap: 8 }}>
              <button class="btn btn-ghost btn-sm" onClick=${onClose}>Close</button>
              <button class="btn btn-primary btn-sm" onClick=${handleSave}>Save</button>
            </div>
          </div>
          
          <!-- Editor mount -->
          <div ref=${containerRef} style=${{ flex: 1, width: '100%', height: '100%', background: '#1d1f21' }}>
            ${!loaded && html`<div style=${{ color: 'var(--text-2)', padding: 20 }}>Loading Ace Editor…</div>`}
          </div>
        </div>
      </div>
    `;
  }

  // ── Recursive Folder Node Component ──────────────────────────────────────────
  function FolderNode({ node, currentPath, onSelectPath }) {
    const [expanded, setExpanded] = useState(false);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = currentPath === node.path;

    const handleToggle = (e) => {
      e.stopPropagation();
      setExpanded(!expanded);
    };

    const handleSelect = (e) => {
      e.stopPropagation();
      onSelectPath(node.path);
    };

    return html`
      <div style=${{ marginLeft: 12 }}>
        <div 
          style=${{
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            padding: '4px 6px', 
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            background: isSelected ? 'var(--accent-dim)' : 'transparent',
            color: isSelected ? 'var(--accent)' : 'var(--text)',
            marginBottom: 2
          }}
          onClick=${handleSelect}
        >
          ${hasChildren 
            ? html`
                <span onClick=${handleToggle} style=${{ display: 'inline-flex', width: 12, cursor: 'pointer', userSelect: 'none', fontSize: 9 }}>
                  ${expanded ? '▼' : '▶'}
                </span>
              `
            : html`<span style=${{ display: 'inline-flex', width: 12 }}></span>`
          }
          <${FolderIcon} />
          <span style=${{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ${node.name}
          </span>
        </div>
        
        ${expanded && hasChildren && html`
          <div style=${{ borderLeft: '1px solid var(--border-2)', marginLeft: 6 }}>
            ${node.children.map(child => html`
              <${FolderNode} 
                key=${child.path} 
                node=${child} 
                currentPath=${currentPath} 
                onSelectPath=${onSelectPath} 
              />
            `)}
          </div>
        `}
      </div>
    `;
  }

  // ── Breadcrumbs component ───────────────────────────────────────────────────
  function Breadcrumbs({ path, onNavigate }) {
    const parts = path.split('/').filter(Boolean);

    const handleClick = (index) => {
      const targetPath = '/' + parts.slice(0, index + 1).join('/');
      onNavigate(targetPath);
    };

    return html`
      <div style=${{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
        <span 
          style=${{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 500 }}
          onClick=${() => onNavigate(parts[0] === 'home' ? '/home' : '/')}
        >
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
            >
              ${part}
            </span>
          </span>
        `)}
      </div>
    `;
  }

  // ── Root Plugin component ────────────────────────────────────────────────────
  function FileManagerPlugin() {
    const { ok, err: toastErr } = useToast();
    const isAdmin = localStorage.getItem('user_role') === 'admin';
    const homeDir = '/home/' + (localStorage.getItem('username') ?? '');
    const rootPath = isAdmin ? '/home' : homeDir;

    const [currentPath, setCurrentPath] = useState(rootPath);
    const [editorFile, setEditorFile] = useState(null); // { path, content }

    // Modal target triggers
    const [mkdirOpen, setMkdirOpen] = useState(false);
    const [mkfileOpen, setMkfileOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState(null); // row item
    const [deleteTarget, setDeleteTarget] = useState(null); // row item
    const [zipTarget, setZipTarget] = useState(null); // row item
    const [unzipTarget, setUnzipTarget] = useState(null); // row item

    const fileInputRef = useRef(null);

    // Fetch directory tree list
    const { data: treeData, loading: treeLoading, refetch: refetchTree } = useApi(
      () => sdk.fetch('GET', '/cpanelapi/files/tree?path=' + encodeURIComponent(rootPath)),
      [rootPath]
    );

    // Fetch files in directory
    const { data: filesData, loading: filesLoading, refetch: refetchFiles } = useApi(
      () => sdk.fetch('GET', '/cpanelapi/files/list?path=' + encodeURIComponent(currentPath)),
      [currentPath]
    );

    // Navigate to parent directory
    const handleGoUp = () => {
      if (currentPath === rootPath || currentPath === '/') return;
      const parts = currentPath.split('/').filter(Boolean);
      parts.pop();
      setCurrentPath('/' + parts.join('/'));
    };

    // Load file contents into Editor Modal
    const handleOpenFile = async (file) => {
      const filePath = currentPath + '/' + file.name;
      try {
        const res = await sdk.fetch('GET', '/cpanelapi/files/read?path=' + encodeURIComponent(filePath));
        setEditorFile({ path: filePath, content: res.content });
      } catch (err) {
        toastErr(err.message || 'Could not read file');
      }
    };

    // Save edited file contents
    const handleSaveFile = async (newContent) => {
      if (!editorFile) return;
      try {
        await sdk.fetch('POST', '/cpanelapi/files/write', {
          path: editorFile.path,
          content: newContent
        });
        ok('File saved successfully');
        setEditorFile(null);
        refetchFiles();
      } catch (err) {
        toastErr(err.message || 'Could not save file');
      }
    };

    // Upload selected file
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
          headers: {
            'Authorization': 'Bearer ' + token
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        ok('Uploaded ' + file.name + ' successfully!');
        refetchFiles();
        refetchTree();
      } catch (err) {
        toastErr(err.message || 'Upload failed');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''; // reset file picker
      }
    };

    return html`
      <div class="page">
        <!-- Header -->
        <div class="page-header">
          <div>
            <h1 class="page-title">File Manager</h1>
            <p class="page-desc">Browse, edit, and compress files on your server</p>
          </div>
        </div>

        <!-- Sidebar tree + Explorer flex grid -->
        <div style=${{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
          <!-- Folder Tree sidebar card -->
          <div class="card" style=${{ width: 250, flexShrink: 0, padding: '16px 12px', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column' }}>
            <span style=${{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.08em', marginBottom: 12, paddingLeft: 12 }}>
              Folder Tree
            </span>
            <div style=${{ flex: 1, overflowY: 'auto', maxHeight: '65vh' }}>
              ${treeLoading
                ? html`<div style=${{ color: 'var(--text-3)', fontSize: 12, paddingLeft: 12 }}>Loading tree…</div>`
                : treeData
                  ? html`
                      <${FolderNode} 
                        node=${treeData} 
                        currentPath=${currentPath} 
                        onSelectPath=${setCurrentPath} 
                      />
                    `
                  : html`<div style=${{ color: 'var(--text-3)', fontSize: 12, paddingLeft: 12 }}>No directories</div>`
              }
            </div>
          </div>

          <!-- Main Files list card -->
          <div class="card" style=${{ flex: 1, padding: '16px 20px', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column' }}>
            <!-- Actions top navigation bar -->
            <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <!-- Breadcrumbs navigation -->
              <${Breadcrumbs} path=${currentPath} onNavigate=${setCurrentPath} />

              <!-- Toolbar commands -->
              <div style=${{ display: 'flex', gap: 6 }}>
                <button 
                  class="btn btn-ghost btn-sm" 
                  title="Go Up"
                  onClick=${handleGoUp}
                  disabled=${currentPath === rootPath || currentPath === '/'}
                >
                  <${ArrowUpIcon} />
                  Up
                </button>
                <button 
                  class="btn btn-ghost btn-sm" 
                  title="Refresh"
                  onClick=${() => { refetchFiles(); refetchTree(); }}
                >
                  <${RefreshIcon} />
                  Refresh
                </button>
                <button class="btn btn-ghost btn-sm" onClick=${() => setMkfileOpen(true)}>
                  + New File
                </button>
                <button class="btn btn-ghost btn-sm" onClick=${() => setMkdirOpen(true)}>
                  + New Folder
                </button>
                <button class="btn btn-primary btn-sm" onClick=${() => fileInputRef.current?.click()}>
                  <${UploadIcon} />
                  Upload
                </button>
                <input 
                  type="file" 
                  ref=${fileInputRef} 
                  style=${{ display: 'none' }} 
                  onChange=${handleUpload} 
                />
              </div>
            </div>

            <!-- Directory listing table -->
            ${filesLoading
              ? html`<div style=${{ color: 'var(--text-2)', fontSize: 13, padding: 20 }}>Loading files…</div>`
              : !filesData?.length
                ? html`
                    <div class="empty">
                      <div class="empty-title">This folder is empty</div>
                      <div class="empty-desc">Create files or folders to populate this directory.</div>
                    </div>
                  `
                : html`
                    <div class="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Size</th>
                            <th>Modified</th>
                            <th>Permissions</th>
                            <th style=${{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${filesData.map(file => {
                            const isFolder = file.type === 'dir';
                            const isZip = file.name.toLowerCase().endsWith('.zip');
                            const icon = isFolder 
                              ? html`<${FolderIcon} />` 
                              : isZip 
                                ? html`<${ZipIcon} />` 
                                : html`<${FileIcon} />`;

                            return html`
                              <tr key=${file.name}>
                                <td>
                                  <div 
                                    style=${{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                                    onClick=${() => isFolder ? setCurrentPath(currentPath + '/' + file.name) : handleOpenFile(file)}
                                  >
                                    ${icon}
                                    <span style=${{ fontWeight: isFolder ? 500 : 400, color: 'var(--text)' }}>
                                      ${file.name}
                                    </span>
                                  </div>
                                </td>
                                <td class="mono" style=${{ color: 'var(--text-2)' }}>${file.size}</td>
                                <td style=${{ color: 'var(--text-2)' }}>${file.modified}</td>
                                <td class="mono" style=${{ color: 'var(--text-3)' }}>${file.permissions}</td>
                                <td>
                                  <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    ${!isFolder && html`
                                      <button 
                                        class="btn btn-ghost btn-sm" 
                                        style=${{ padding: 4 }} 
                                        title="Edit File"
                                        onClick=${() => handleOpenFile(file)}
                                      >
                                        <${EditIcon} />
                                      </button>
                                      <a 
                                        class="btn btn-ghost btn-sm" 
                                        style=${{ padding: 4 }} 
                                        title="Download File"
                                        href=${'/cpanelapi/files/download?path=' + encodeURIComponent(currentPath + '/' + file.name)}
                                        download
                                      >
                                        <${DownloadIcon} />
                                      </a>
                                    `}
                                    ${isZip && html`
                                      <button 
                                        class="btn btn-ghost btn-sm" 
                                        style=${{ padding: 4 }} 
                                        title="Decompress (Unzip)"
                                        onClick=${() => setUnzipTarget(file)}
                                      >
                                        Extract
                                      </button>
                                    `}
                                    <button 
                                      class="btn btn-ghost btn-sm" 
                                      style=${{ padding: 4 }} 
                                      title="Compress (Zip)"
                                      onClick=${() => setZipTarget(file)}
                                    >
                                      <${ZipActionIcon} />
                                    </button>
                                    <button 
                                      class="btn btn-ghost btn-sm" 
                                      style=${{ padding: 4 }} 
                                      title="Rename"
                                      onClick=${() => setRenameTarget(file)}
                                    >
                                      <${RenameIcon} />
                                    </button>
                                    <button 
                                      class="btn btn-danger btn-sm" 
                                      style=${{ padding: 4 }} 
                                      title="Delete"
                                      onClick=${() => setDeleteTarget(file)}
                                    >
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
          </div>
        </div>

        <!-- ── POPUP DIALOGS & OVERLAYS ────────────────────────────────────────── -->

        <!-- Text Editor Overlay -->
        ${editorFile && html`
          <${AceEditor} 
            path=${editorFile.path} 
            content=${editorFile.content} 
            onClose=${() => setEditorFile(null)} 
            onSave=${handleSaveFile} 
          />
        `}

        <!-- New Folder Modal -->
        ${mkdirOpen && html`
          <${SdkFormModal}
            open=${true}
            title="Create Directory"
            fields=${[{
              key: 'name', label: 'Directory Name', type: 'text',
              required: true, placeholder: 'my-folder'
            }]}
            onClose=${() => setMkdirOpen(false)}
            onSubmit=${async (values) => {
              const fullPath = currentPath + '/' + values.name;
              await sdk.fetch('POST', '/cpanelapi/files/mkdir', { path: fullPath });
              setMkdirOpen(false);
              refetchFiles();
              refetchTree();
              ok('Folder created: ' + values.name);
            }}
          />
        `}

        <!-- New File Modal -->
        ${mkfileOpen && html`
          <${SdkFormModal}
            open=${true}
            title="Create Empty File"
            fields=${[{
              key: 'name', label: 'File Name', type: 'text',
              required: true, placeholder: 'index.html'
            }]}
            onClose=${() => setMkfileOpen(false)}
            onSubmit=${async (values) => {
              const fullPath = currentPath + '/' + values.name;
              await sdk.fetch('POST', '/cpanelapi/files/write', { path: fullPath, content: '' });
              setMkfileOpen(false);
              refetchFiles();
              ok('File created: ' + values.name);
              // Open file editor directly
              setEditorFile({ path: fullPath, content: '' });
            }}
          />
        `}

        <!-- Rename Modal -->
        ${renameTarget && html`
          <${SdkFormModal}
            open=${true}
            title=${'Rename — ' + renameTarget.name}
            fields=${[{
              key: 'new_name', label: 'New Name', type: 'text',
              required: true, placeholder: renameTarget.name
            }]}
            onClose=${() => setRenameTarget(null)}
            onSubmit=${async (values) => {
              const srcPath = currentPath + '/' + renameTarget.name;
              await sdk.fetch('POST', '/cpanelapi/filemanager/rename', {
                path: srcPath,
                new_name: values.new_name
              });
              setRenameTarget(null);
              refetchFiles();
              refetchTree();
              ok('Renamed successfully');
            }}
          />
        `}

        <!-- Zip Archive Modal -->
        ${zipTarget && html`
          <${SdkFormModal}
            open=${true}
            title="Create Zip Archive"
            fields=${[{
              key: 'archive_name', label: 'Archive Name', type: 'text',
              required: true, placeholder: zipTarget.name + '.zip'
            }]}
            onClose=${() => setZipTarget(null)}
            onSubmit=${async (values) => {
              const srcPath = currentPath + '/' + zipTarget.name;
              await sdk.fetch('POST', '/cpanelapi/filemanager/zip', {
                path: srcPath,
                archive_name: values.archive_name
              });
              setZipTarget(null);
              refetchFiles();
              ok('Archive created: ' + values.archive_name);
            }}
          />
        `}

        <!-- Unzip Extraction Modal -->
        ${unzipTarget && html`
          <${SdkFormModal}
            open=${true}
            title="Extract Zip Archive"
            fields=${[{
              key: 'dest_dir', label: 'Destination Folder', type: 'text',
              required: true, placeholder: currentPath
            }]}
            onClose=${() => setUnzipTarget(null)}
            onSubmit=${async (values) => {
              const srcPath = currentPath + '/' + unzipTarget.name;
              await sdk.fetch('POST', '/cpanelapi/filemanager/unzip', {
                archive_path: srcPath,
                dest_dir: values.dest_dir
              });
              setUnzipTarget(null);
              refetchFiles();
              refetchTree();
              ok('Extraction completed');
            }}
          />
        `}

        <!-- Delete Confirmation Modal -->
        ${deleteTarget && html`
          <${SdkConfirmModal}
            open=${true}
            title="Delete Item"
            message=${'Are you sure you want to delete "' + deleteTarget.name + '"? This action is permanent and cannot be undone.'}
            danger=${true}
            onClose=${() => setDeleteTarget(null)}
            onConfirm=${async () => {
              const fullPath = currentPath + '/' + deleteTarget.name;
              await sdk.fetch('DELETE', '/cpanelapi/files/delete?path=' + encodeURIComponent(fullPath));
              setDeleteTarget(null);
              refetchFiles();
              refetchTree();
              ok('Deleted successfully');
            }}
          />
        `}
      </div>
    `;
  }

  window.__hpkg_sdk.register('files', FileManagerPlugin);
})();
