import { useEffect, useState } from 'react';

const styles = {
  root: { display: 'flex', minHeight: '100vh', background: '#0a0a0b', color: '#f5f5f7', fontFamily: 'Inter, system-ui, sans-serif' },
  aside: { width: 240, background: '#111113', borderRight: '1px solid rgba(255,255,255,.08)', padding: '28px 16px', display: 'flex', flexDirection: 'column' as const },
  brand: { fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', marginBottom: 32 },
  navBtn: (active: boolean) => ({
    display: 'block', width: '100%', textAlign: 'left' as const, background: active ? 'rgba(255,255,255,.08)' : 'transparent',
    color: active ? '#fff' : '#a1a1a6', border: 0, padding: '11px 14px', borderRadius: 10, marginBottom: 4, fontWeight: 600, fontSize: 14, cursor: 'pointer'
  }),
  main: { flex: 1, padding: '32px 40px', maxWidth: 1100 },
  h1: { fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 8px' },
  sub: { color: '#a1a1a6', marginBottom: 28, fontSize: 15 },
  card: { background: 'rgba(22,22,24,.85)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 24, marginBottom: 20 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, margin: '16px 0 6px' },
  input: { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', background: '#111', color: '#fff', fontSize: 14.5, boxSizing: 'border-box' as const },
  textarea: { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', background: '#111', color: '#fff', fontSize: 14.5, minHeight: 120, resize: 'vertical' as const, boxSizing: 'border-box' as const },
  btn: (primary = false) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 999, border: '1px solid transparent',
    background: primary ? '#f5f5f7' : 'rgba(255,255,255,.08)', color: primary ? '#000' : '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginRight: 10
  }),
  notice: { background: 'rgba(48,209,88,.12)', color: '#30d158', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 },
  error: { background: 'rgba(255,69,58,.12)', color: '#ff453a', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 },
  pre: { background: '#111', padding: 16, borderRadius: 12, overflow: 'auto', fontSize: 13, lineHeight: 1.5 },
  item: { border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 14, marginBottom: 10, background: '#111' },
};

function useApi() {
  const [key, setKey] = useState(localStorage.getItem('ds_key') || '');
  const saveKey = (k: string) => { localStorage.setItem('ds_key', k); setKey(k); };
  const api = async (path: string, opts: RequestInit = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers as any || {}) };
    if (key) headers.authorization = `Bearer ${key}`;
    const r = await fetch(path, { ...opts, headers });
    const text = await r.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!r.ok) throw new Error(data.error || r.statusText || 'Request failed');
    return data;
  };
  return { key, saveKey, api };
}

export default function App() {
  const { key, saveKey, api } = useApi();
  const [tab, setTab] = useState('dashboard');
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [label, setLabel] = useState('Dev user');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [subreddit, setSubreddit] = useState('');

  const load = async () => {
    if (!key) return;
    try {
      const s = await api('/api/status');
      setStatus(s);
      const h = await api('/api/history');
      setHistory(h || []);
      setErr('');
    } catch (e: any) {
      setStatus(null);
      setErr(e.message);
    }
  };

  useEffect(() => { load(); }, [key]);

  const signup = async () => {
    setErr(''); setMsg('');
    try {
      const u = await api('/api/signup', { method: 'POST', body: JSON.stringify({ label }) });
      saveKey(u.apiKey);
      setMsg('Account created. Key saved.');
    } catch (e: any) { setErr(e.message); }
  };

  const publish = async () => {
    setErr(''); setMsg('');
    try {
      const r = await api('/api/publish', { method: 'POST', body: JSON.stringify({ title, text, subreddit }) });
      setMsg('Submitted: ' + (r.id || 'ok'));
      setTitle(''); setText('');
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const sc = async (path: string, body?: any) => {
    setErr(''); setMsg('');
    try {
      const r = await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      setMsg(JSON.stringify(r, null, 2));
    } catch (e: any) { setErr(e.message); }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'compose', label: 'Compose' },
    { id: 'history', label: 'History' },
    { id: 'snapchat', label: 'Snapchat' },
    { id: 'onlyfans', label: 'OnlyFans' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div style={styles.root}>
      <aside style={styles.aside}>
        <div style={styles.brand}>Dark Suite</div>
        {tabs.map(t => (
          <button key={t.id} style={styles.navBtn(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
        <div style={{ marginTop: 'auto', fontSize: 11, color: '#a1a1a6', paddingTop: 20 }}>v2 · Postgres</div>
      </aside>
      <main style={styles.main}>
        {msg && <div style={styles.notice}>{msg}</div>}
        {err && <div style={styles.error}>{err}</div>}

        {tab === 'dashboard' && (
          <>
            <h1 style={styles.h1}>Dashboard</h1>
            <p style={styles.sub}>Overview of your workspace.</p>
            <div style={styles.card}>
              {status ? (
                <>
                  <div style={{ marginBottom: 12 }}><strong>User</strong> · {status.label}</div>
                  <div style={{ marginBottom: 12 }}><strong>ID</strong> · {status.userId}</div>
                  <div><strong>OnlyFans proxy</strong> · {status.onlyCreatorUrl}</div>
                </>
              ) : <p>Sign in via Settings to see status.</p>}
              <button style={{ ...styles.btn(), marginTop: 16 }} onClick={load}>Refresh</button>
            </div>
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}>Recent activity</h3>
              {history.slice(0, 5).map((h: any) => (
                <div key={h.id} style={styles.item}>
                  <strong>{h.title}</strong><br />
                  <span style={{ color: '#a1a1a6', fontSize: 13 }}>{h.subreddit} · {h.state}</span>
                </div>
              ))}
              {history.length === 0 && <p style={{ color: '#a1a1a6' }}>No posts yet.</p>}
            </div>
          </>
        )}

        {tab === 'compose' && (
          <>
            <h1 style={styles.h1}>Compose</h1>
            <p style={styles.sub}>Create a post. Stored in Postgres.</p>
            <div style={styles.card}>
              <label style={styles.label}>Title</label>
              <input style={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Post title" />
              <label style={styles.label}>Body</label>
              <textarea style={styles.textarea} value={text} onChange={e => setText(e.target.value)} placeholder="Write your post…" />
              <label style={styles.label}>Subreddit (optional)</label>
              <input style={styles.input} value={subreddit} onChange={e => setSubreddit(e.target.value)} placeholder="e.g. test" />
              <div style={{ marginTop: 20 }}>
                <button style={styles.btn(true)} onClick={publish} disabled={!key}>Publish</button>
              </div>
            </div>
          </>
        )}

        {tab === 'history' && (
          <>
            <h1 style={styles.h1}>History</h1>
            <p style={styles.sub}>All submissions.</p>
            {history.map((h: any) => (
              <div key={h.id} style={styles.item}>
                <strong>{h.title}</strong>
                <div style={{ color: '#a1a1a6', fontSize: 13, marginTop: 4 }}>{h.subreddit || '—'} · {h.state} · {new Date(h.createdAt).toLocaleString()}</div>
                {h.text && <p style={{ margin: '8px 0 0', fontSize: 14 }}>{h.text.slice(0, 200)}{h.text.length > 200 ? '…' : ''}</p>}
              </div>
            ))}
            {history.length === 0 && <p style={{ color: '#a1a1a6' }}>Nothing yet.</p>}
          </>
        )}

        {tab === 'snapchat' && (
          <>
            <h1 style={styles.h1}>Snapchat</h1>
            <p style={styles.sub}>Emulator actions (stubs until ADB is connected).</p>
            <div style={styles.card}>
              <button style={styles.btn()} onClick={() => sc('/api/snapchat/status')}>Status</button>
              <button style={styles.btn(true)} onClick={() => sc('/api/snapchat/record-draft', { durationMs: 5000 })}>Record draft</button>
              <button style={styles.btn(true)} onClick={() => sc('/api/snapchat/post-draft', { asStory: true })}>Post draft</button>
            </div>
          </>
        )}

        {tab === 'onlyfans' && (
          <>
            <h1 style={styles.h1}>OnlyFans</h1>
            <p style={styles.sub}>Proxied through the backend.</p>
            <div style={styles.card}>
              <a href="/onlyfans/ui" target="_blank" rel="noreferrer" style={styles.btn(true) as any}>Open dashboard</a>
              <a href="/onlyfans/api/health" target="_blank" rel="noreferrer" style={{ ...styles.btn(), marginLeft: 10 } as any}>Health</a>
            </div>
          </>
        )}

        {tab === 'settings' && (
          <>
            <h1 style={styles.h1}>Settings</h1>
            <p style={styles.sub}>Create an account or paste an existing API key.</p>
            <div style={styles.card}>
              <label style={styles.label}>Display name</label>
              <input style={styles.input} value={label} onChange={e => setLabel(e.target.value)} />
              <div style={{ marginTop: 16 }}>
                <button style={styles.btn(true)} onClick={signup}>Create account</button>
              </div>
            </div>
            <div style={styles.card}>
              <label style={styles.label}>API key</label>
              <input style={styles.input} type="password" value={key} onChange={e => saveKey(e.target.value)} placeholder="Paste key or create above" />
              <p style={{ color: '#a1a1a6', fontSize: 13, marginTop: 8 }}>Stored in localStorage. Sent as Bearer token.</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
