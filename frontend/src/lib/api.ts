const BASE = '/cpanelapi';

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/${path}`, { headers: authHeader() });
  return handleResponse<T>(r);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(r);
}

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });
  return handleResponse<T>(r);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  return handleResponse<T>(r);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'PUT',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(r);
}
