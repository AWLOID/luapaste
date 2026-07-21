'use client';
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';

export type ScriptItem = {
  id: string;
  name: string;
  extension: 'lua' | 'txt';
  hits: number;
  is_encrypted: boolean;
  expires_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

type UploadResult = { rawUrl: string; loadstring: string };

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function isExpired(value: string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

export default function Dashboard({
  initialScripts,
  adminEmail,
}: {
  initialScripts: ScriptItem[];
  adminEmail: string;
}) {
  const [scripts, setScripts] = useState<ScriptItem[]>(initialScripts);
  const [mode, setMode] = useState<'file' | 'paste'>('file');

  const [file, setFile] = useState<File | null>(null);
  const [pasteName, setPasteName] = useState('');
  const [pasteExt, setPasteExt] = useState<'lua' | 'txt'>('lua');
  const [pasteContent, setPasteContent] = useState('');
  const [expireHours, setExpireHours] = useState('');

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [copied, setCopied] = useState('');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const total = scripts.length;
    const hits = scripts.reduce((sum, s) => sum + (s.hits || 0), 0);
    const active = scripts.filter((s) => !isExpired(s.expires_at)).length;
    return { total, hits, active, expired: total - active };
  }, [scripts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter((s) => s.name.toLowerCase().includes(q));
  }, [scripts, search]);

  function onFileChange(ev: ChangeEvent<HTMLInputElement>) {
    setFile(ev.target.files?.[0] || null);
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      /* ignore */
    }
  }

  async function handleUpload(ev: FormEvent) {
    ev.preventDefault();
    setError('');
    setResult(null);

    const form = new FormData();
    if (mode === 'file') {
      if (!file) {
        setError('Choose a .lua or .txt file first.');
        return;
      }
      form.append('file', file);
    } else {
      if (!pasteContent.trim()) {
        setError('Paste some script content first.');
        return;
      }
      form.append('content', pasteContent);
      form.append('name', pasteName || 'script');
      form.append('extension', pasteExt);
    }
    if (expireHours.trim()) form.append('expireHours', expireHours.trim());

    setUploading(true);
    try {
      const res = await fetch('/api/scripts/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Upload failed.');
        return;
      }
      setScripts((prev) => [data.script, ...prev]);
      setResult({ rawUrl: data.rawUrl, loadstring: data.loadstring });
      setFile(null);
      setPasteContent('');
      setPasteName('');
      setExpireHours('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setError('Network error during upload.');
    } finally {
      setUploading(false);
    }
  }

  async function patchScript(id: string, patch: Record<string, unknown>) {
    const res = await fetch('/api/scripts/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Update failed.');
      return;
    }
    setScripts((prev) => prev.map((s) => (s.id === id ? data.script : s)));
  }

  function rename(item: ScriptItem) {
    const next = window.prompt('New name', item.name);
    if (next && next.trim() && next.trim() !== item.name) {
      void patchScript(item.id, { name: next.trim() });
    }
  }

  function setExpiry(item: ScriptItem) {
    const next = window.prompt('Expire in how many hours? Leave empty to make permanent.', '');
    if (next === null) return;
    void patchScript(item.id, { expireHours: next.trim() ? next.trim() : null });
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this script permanently?')) return;
    const res = await fetch('/api/scripts/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setScripts((prev) => prev.filter((s) => s.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Delete failed.');
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.reload();
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Script Vault — Admin</p>
          <h1>Encrypted script dashboard</h1>
        </div>
        <div className="top-actions">
          <span className="account-chip">{adminEmail}</span>
          <button className="ghost" type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <div className="grid">
        <div className="card upload-card">
          <h2>Upload a script</h2>
          <p className="muted">Stored AES-256 encrypted. The raw link is shown once — copy it now.</p>

          <div className="top-actions" style={{ margin: '6px 0 14px' }}>
            <button type="button" className={mode === 'file' ? 'secondary' : 'ghost'} onClick={() => setMode('file')}>Upload file</button>
            <button type="button" className={mode === 'paste' ? 'secondary' : 'ghost'} onClick={() => setMode('paste')}>Paste text</button>
          </div>

          <form className="stack" onSubmit={handleUpload}>
            {mode === 'file' ? (
              <label className="filebox">
                <span>{file ? file.name : 'Choose a .lua or .txt file'}</span>
                <input ref={fileInputRef} type="file" accept=".lua,.txt" onChange={onFileChange} hidden />
              </label>
            ) : (
              <>
                <label>
                  <span>Name</span>
                  <input type="text" placeholder="my-script" value={pasteName} onChange={(e) => setPasteName(e.target.value)} />
                </label>
                <label>
                  <span>Type</span>
                  <select value={pasteExt} onChange={(e) => setPasteExt(e.target.value as 'lua' | 'txt')}>
                    <option value="lua">.lua</option>
                    <option value="txt">.txt</option>
                  </select>
                </label>
                <label>
                  <span>Content</span>
                  <textarea rows={8} placeholder="-- paste your script here" value={pasteContent} onChange={(e) => setPasteContent(e.target.value)} />
                </label>
              </>
            )}

            <label>
              <span>Expire after (hours, optional)</span>
              <input type="number" min={1} max={8760} placeholder="never" value={expireHours} onChange={(e) => setExpireHours(e.target.value)} />
            </label>

            {error ? <p className="error">{error}</p> : null}
            <button className="primary" type="submit" disabled={uploading}>
              {uploading ? 'Encrypting & uploading…' : 'Upload & Encrypt'}
            </button>
          </form>
        </div>

        <div className="card result-card">
          <h2>Access link</h2>
          {result ? (
            <div className="stack">
              <div className="warn-box">Shown once. Copy it now — it cannot be recovered later.</div>
              <label>
                <span>Raw URL</span>
                <input readOnly value={result.rawUrl} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <button className="secondary" type="button" onClick={() => copy(result.rawUrl, 'url')}>
                {copied === 'url' ? 'Copied!' : 'Copy raw URL'}
              </button>
              <label>
                <span>loadstring</span>
                <input readOnly value={result.loadstring} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <button className="secondary" type="button" onClick={() => copy(result.loadstring, 'ls')}>
                {copied === 'ls' ? 'Copied!' : 'Copy loadstring'}
              </button>
              <p className="security-note">The link only works from script clients, not browsers.</p>
            </div>
          ) : (
            <p className="muted">Upload a script to generate its one-time access link.</p>
          )}
        </div>
      </div>

      <div className="card table-card">
        <div className="section-head">
          <h2>Your scripts</h2>
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
        </div>

        <div className="admin-stats">
          <div className="stat-card"><span className="stat-value">{stats.total}</span><span className="stat-label">Scripts</span></div>
          <div className="stat-card"><span className="stat-value">{stats.active}</span><span className="stat-label">Active</span></div>
          <div className="stat-card"><span className="stat-value">{stats.expired}</span><span className="stat-label">Expired</span></div>
          <div className="stat-card"><span className="stat-value">{stats.hits}</span><span className="stat-label">Total hits</span></div>
        </div>

        {filtered.length === 0 ? (
          <p className="muted">No scripts found.</p>
        ) : (
          <div className="script-list">
            {filtered.map((item) => (
              <article className="script-row" key={item.id}>
                <div className="script-main">
                  <strong>{item.name}</strong>
                  <span className="pill">{item.extension}</span>
                  {item.is_encrypted ? <span className="pill pill-ok">encrypted</span> : null}
                  {isExpired(item.expires_at) ? <span className="pill pill-expired">expired</span> : null}
                </div>
                <div className="script-row-meta">
                  <span className="meta-chip">Hits: {item.hits}</span>
                  <span className="meta-chip">Created: {formatDate(item.created_at)}</span>
                  <span className="meta-chip">Expires: {item.expires_at ? formatDate(item.expires_at) : 'never'}</span>
                  <span className="meta-chip">Last used: {formatDate(item.last_accessed_at)}</span>
                </div>
                <div className="actions">
                  <button className="ghost" type="button" onClick={() => rename(item)}>Rename</button>
                  <button className="ghost" type="button" onClick={() => setExpiry(item)}>Expiry</button>
                  <button className="ghost" type="button" onClick={() => patchScript(item.id, { resetHits: true })}>Reset hits</button>
                  <button className="danger" type="button" onClick={() => remove(item.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}