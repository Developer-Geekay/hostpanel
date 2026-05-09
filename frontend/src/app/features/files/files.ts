import { Component, signal, computed, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FileService, FileEntry, DirNode } from '../../services/file.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatCardModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './files.html',
  styleUrl: './files.css',
})
export class FilesComponent implements OnInit {
  private snackBar    = inject(MatSnackBar);
  private fileService = inject(FileService);
  private auth        = inject(AuthService);

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  columns = ['icon', 'name', 'size', 'modified', 'permissions', 'actions'];

  currentPath  = signal('/home');
  files        = signal<FileEntry[]>([]);
  dirTree      = signal<DirNode | null>(null);
  isLoading    = signal(false);
  treeLoading  = signal(false);
  expandedPaths = signal<Set<string>>(new Set(['/home']));

  // Editor panel
  editorOpen     = signal(false);
  editorPath     = signal('');
  editorContent  = signal('');
  editorLoading  = signal(false);
  editorSaving   = signal(false);

  // New folder dialog
  showMkdir     = signal(false);
  newFolderName = signal('');
  mkdirLoading  = signal(false);

  // Delete confirmation
  deletingPath  = signal<string | null>(null);

  // Upload
  uploading = signal(false);

  pathSegments = computed(() => {
    const parts = this.currentPath().split('/').filter(Boolean);
    return parts.map((p, i) => ({
      label: p,
      path: '/' + parts.slice(0, i + 1).join('/'),
    }));
  });

  ngOnInit() {
    this.loadTree();
    this.loadDirectory('/home');
  }

  loadTree() {
    this.treeLoading.set(true);
    this.fileService.getTree('/home').subscribe({
      next: (tree) => { this.dirTree.set(tree); this.treeLoading.set(false); },
      error: () => this.treeLoading.set(false),
    });
  }

  loadDirectory(path: string) {
    this.currentPath.set(path);
    this.isLoading.set(true);
    this.fileService.listDirectory(path).subscribe({
      next: (data) => { this.files.set(data); this.isLoading.set(false); },
      error: (err) => {
        this.isLoading.set(false);
        const detail = err.error?.detail || 'Failed to list directory.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
        this.files.set([]);
      }
    });
  }

  navigate(path: string) {
    this.editorOpen.set(false);
    this.loadDirectory(path);
  }

  navigateUp() {
    const parent = this.currentPath().split('/').slice(0, -1).join('/') || '/';
    if (parent !== this.currentPath()) this.navigate(parent);
  }

  toggleDir(path: string) {
    this.expandedPaths.update(set => {
      const next = new Set(set);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  isExpanded(path: string) {
    return this.expandedPaths().has(path);
  }

  clickEntry(entry: FileEntry) {
    const fullPath = this.currentPath() + '/' + entry.name;
    if (entry.type === 'dir') {
      this.expandedPaths.update(s => { const n = new Set(s); n.add(fullPath); return n; });
      this.navigate(fullPath);
    } else {
      this.openEditor(fullPath);
    }
  }

  openEditor(path: string) {
    this.editorOpen.set(true);
    this.editorPath.set(path);
    this.editorContent.set('');
    this.editorLoading.set(true);
    this.fileService.readFile(path).subscribe({
      next: (res) => { this.editorContent.set(res.content); this.editorLoading.set(false); },
      error: (err) => {
        this.editorLoading.set(false);
        this.editorOpen.set(false);
        const detail = err.error?.detail || 'Cannot open file.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  saveEditor() {
    this.editorSaving.set(true);
    this.fileService.writeFile(this.editorPath(), this.editorContent()).subscribe({
      next: () => {
        this.editorSaving.set(false);
        this.snackBar.open('File saved', 'Dismiss', { duration: 2500 });
      },
      error: () => {
        this.editorSaving.set(false);
        this.snackBar.open('Failed to save file.', 'Dismiss', { duration: 4000 });
      }
    });
  }

  closeEditor() {
    this.editorOpen.set(false);
  }

  deleteEntry(path: string, name: string) {
    this.deletingPath.set(path);
    this.fileService.delete(path).subscribe({
      next: () => {
        this.files.update(list => list.filter(f => f.name !== name));
        this.deletingPath.set(null);
        this.snackBar.open(`Deleted ${name}`, 'Dismiss', { duration: 2500 });
      },
      error: (err) => {
        this.deletingPath.set(null);
        const detail = err.error?.detail || 'Failed to delete.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  openMkdir() {
    this.newFolderName.set('');
    this.showMkdir.set(true);
  }

  submitMkdir() {
    const name = this.newFolderName().trim();
    if (!name) return;
    const newPath = this.currentPath() + '/' + name;
    this.mkdirLoading.set(true);
    this.fileService.mkdir(newPath).subscribe({
      next: () => {
        this.showMkdir.set(false);
        this.mkdirLoading.set(false);
        this.snackBar.open(`Folder ${name} created`, 'Dismiss', { duration: 2500 });
        this.loadDirectory(this.currentPath());
        this.loadTree();
      },
      error: (err) => {
        this.mkdirLoading.set(false);
        const detail = err.error?.detail || 'Failed to create folder.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  triggerUpload() {
    this.fileInputRef.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.uploading.set(true);
    this.fileService.upload(this.currentPath(), file).subscribe({
      next: () => {
        this.uploading.set(false);
        this.snackBar.open(`${file.name} uploaded`, 'Dismiss', { duration: 2500 });
        this.loadDirectory(this.currentPath());
        input.value = '';
      },
      error: (err) => {
        this.uploading.set(false);
        const detail = err.error?.detail || 'Upload failed.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
        input.value = '';
      }
    });
  }

  downloadFile(path: string) {
    const url = this.fileService.downloadUrl(path);
    const token = `Bearer ${this.auth.getToken()}`;
    fetch(url, { headers: { Authorization: token } })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = path.split('/').pop() || 'download';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => this.snackBar.open('Download failed.', 'Dismiss', { duration: 3000 }));
  }

  getFileIcon(entry: FileEntry): string {
    if (entry.type === 'dir') return 'folder';
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      html: 'code', htm: 'code', php: 'code', js: 'javascript', ts: 'code',
      css: 'css', json: 'data_object', xml: 'code',
      jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image',
      zip: 'folder_zip', gz: 'folder_zip', tar: 'folder_zip', bz2: 'folder_zip',
      log: 'receipt_long', txt: 'article', md: 'article',
      sh: 'terminal', bash: 'terminal', py: 'code', rb: 'code',
      sql: 'storage', pdf: 'picture_as_pdf',
    };
    return map[ext] ?? 'draft';
  }

  isTextFile(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const textExts = ['txt', 'html', 'htm', 'php', 'js', 'ts', 'css', 'json', 'xml',
      'sh', 'bash', 'py', 'rb', 'conf', 'ini', 'md', 'log', 'env', 'htaccess', 'sql'];
    return textExts.includes(ext) || !ext;
  }
}
