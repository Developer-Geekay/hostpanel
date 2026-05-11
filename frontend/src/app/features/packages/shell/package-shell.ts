import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

declare global {
  interface Window {
    __hpkg?: Record<string, {
      init(el: HTMLElement, api: PackageApi): void;
      destroy?(): void;
    }>;
  }
}

interface PackageApi {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
  raw(method: string, path: string): Promise<Response>;
}

@Component({
  selector: 'app-package-shell',
  standalone: true,
  imports: [],
  template: `
    <div #pkgHost class="pkg-host">
      @if (error) {
        <div class="pkg-error">
          <p>Failed to load package UI</p>
          <code>{{ error }}</code>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .pkg-host { width: 100%; min-height: 100%; }
    .pkg-error {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 300px; gap: 10px;
      color: #6b8a91; font-family: monospace;
    }
    .pkg-error p { font-size: 14px; margin: 0; }
    .pkg-error code { font-size: 12px; opacity: 0.7; }
  `]
})
export class PackageShellComponent implements OnInit, OnDestroy {
  @ViewChild('pkgHost', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private slug = '';
  error = '';

  ngOnInit() {
    this.slug = this.route.snapshot.data['slug'] ?? '';
    if (this.slug) this.loadPackage();
  }

  ngOnDestroy() {
    const pkg = window.__hpkg?.[this.slug];
    pkg?.destroy?.();
    this.hostRef.nativeElement.replaceChildren();
  }

  private buildApi(slug: string): PackageApi {
    const base = `/cpanelapi/${slug}`;
    const authHeader = () => `Bearer ${localStorage.getItem('auth_token') ?? ''}`;

    return {
      async get(path) {
        const res = await fetch(`${base}/${path}`, { headers: { Authorization: authHeader() } });
        if (!res.ok) throw Object.assign(new Error(await res.text()), { status: res.status });
        return res.json();
      },
      async post(path, body) {
        const res = await fetch(`${base}/${path}`, {
          method: 'POST',
          headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw Object.assign(new Error(await res.text()), { status: res.status });
        return res.json();
      },
      async delete(path) {
        const res = await fetch(`${base}/${path}`, {
          method: 'DELETE',
          headers: { Authorization: authHeader() },
        });
        if (!res.ok) throw Object.assign(new Error(await res.text()), { status: res.status });
        return res.json();
      },
      async raw(method, path) {
        return fetch(`${base}/${path}`, {
          method,
          headers: { Authorization: authHeader() },
        });
      },
    };
  }

  private loadPackage() {
    const { slug } = this;
    const hostEl = this.hostRef.nativeElement;
    const api = this.buildApi(slug);

    const initPkg = () => {
      const pkg = window.__hpkg?.[slug];
      if (pkg) {
        pkg.init(hostEl, api);
      } else {
        this.error = `Package "${slug}" did not register window.__hpkg['${slug}']`;
      }
    };

    if (window.__hpkg?.[slug]) {
      initPkg();
      return;
    }

    const script = document.createElement('script');
    script.src = `/packages/${slug}/main.js`;
    script.onload = initPkg;
    script.onerror = () => {
      this.error = `/packages/${slug}/main.js not found`;
    };
    document.head.appendChild(script);
  }
}
