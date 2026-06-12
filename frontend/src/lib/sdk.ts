import htm from 'htm';
import {
  createElement, ComponentType,
  useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import { useToast }   from '../components/ui/Toast';
import { useApi }     from './sdk-hooks';
import {
  SdkFormModal, SdkConfirmModal, SdkDataTable,
} from './sdk-components';
import type { SdkFormField, SdkTableColumn } from './sdk-components';

export type { SdkFormField, SdkTableColumn };

// htm bound to the host's React.createElement — JSX without compilation
const html = htm.bind(createElement);

// ── Auth-aware fetch ──────────────────────────────────────────────────────────

async function sdkFetch(
  method: string,
  url: string,
  body?: unknown,
): Promise<unknown> {
  const token = localStorage.getItem('auth_token') ?? '';
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const r = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401 → clear session, AuthProvider's storage listener redirects to /login
  if (r.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    localStorage.removeItem('user_role');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'auth_token', newValue: null }),
    );
    throw new Error('Session expired. Please log in again.');
  }

  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw Object.assign(new Error(text || `HTTP ${r.status}`), { status: r.status });
  }

  return r.json();
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry = new Map<string, ComponentType<{ api: unknown }>>();

// ── SDK object (assigned to window.__hpkg_sdk in main.tsx) ───────────────────

export const SDK = {
  // htm — write JSX-like templates without a build step
  html,

  // React hooks — usable inside htm component functions
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,

  // Auth-aware HTTP — use absolute paths (e.g. '/cpanelapi/domains')
  fetch: sdkFetch,

  // Pre-built UI components
  components: {
    SdkFormModal,
    SdkConfirmModal,
    SdkDataTable,
  },

  // Utility hooks
  hooks: {
    useApi,
    useToast,
  },

  // Plugin registration
  register(slug: string, component: ComponentType<{ api: unknown }>) {
    _registry.set(slug, component);
  },

  _registry,
} as const;

// ── Global type ───────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __hpkg_sdk?: typeof SDK;
  }
}
