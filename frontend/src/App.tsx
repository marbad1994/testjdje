import { useEffect, useState } from 'react';

const API = '';

function useApi() {
  const [key, setKey] = useState(localStorage.getItem('ds_key') || '');
  const saveKey = (k: string) => { localStorage.setItem('ds_key', k); setKey(k); };
  const api = async (path: string, opts: RequestInit = {}) => {
    const headers: any = { 'content-type': 'application/json', ...(opts.headers || {}) };
    if (key) headers.authorization = `Bearer ${key}`;
    const r = await fetch(API + path, { ...opts, headers });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  };
  return { key, saveKey, api };
}

export default function App() {
  const { key, saveKey, api } = useApi();
  const [tab, setTab] = useState('status');
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [label, setLabel] = useState('Dev user');

  const load = async () => {
    try {
      const s = await api('/api/status');
      setStatus(s);
      const h = await api('/api/history');
      setHistory(h);
      setMsg('');
    } catch (e: any) {
      setStatus(null);
      setMsg(e.message);
    }
  };

  useEffect(() => { if (key) load(); }, [key]);

  const signup = async () => {
    try {
      const u = await api('/api/signup', { method: 'POST', body: JSON.stringify({ label }) });
      saveKey(u.apiKey);
      setMsg('User created');
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 220, background: '#111', padding: 20, borderRight: '1px solid #222' }}>
        <h2 style={{ margin: '0 0 24px' }}>Dark Suite</h2>
        {['status', 'history', 'snapchat', 'onlyfans', 'settings'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ display: 'block', width: '100%', textAlign: 'left', background: tab === t ? '#222' : 'transparent', color: '#fff', border: 0, padding: '10px 12px', borderRadius: 8, marginBottom: 4 }}>
            {t}
          </button>
        ))}
      </aside>
      <main style={{ flex: 1, padding: 32 }}>
        {msg && <div style={{ background: '#222', padding: 12, borderRadius: 8, marginBottom: 16 }}>{msg}</div>}

        {tab === 'status' && (
          <div>
            <h1>Status</h1>
            {status ? <pre style={{ background: '#111', padding: 16, borderRadius: 8 }}>{JSON.stringify(status, null, 2)}</pre> : <p>Not authenticated</p>}
            <button onClick={load} style={{ marginTop: 12, padding: '8px 16px' }}>Refresh</button>
          </div>
        )}

        {tab === 'history' && (
          <div>
            <h1>History</h1>
            {history.length === 0 && <p>No submissions yet.</p>}
            {history.map((h: any) => (
              <div key={h.id} style={{ border: '1px solid #222', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                <strong>{h.title}</strong> — {h.subreddit} ({h.state})
              </div>
            ))}
          </div>
        )}

        {tab === 'snapchat' && (
          <div>
            <h1>Snapchat</h1>
            <button onClick={async () => { try { const r = await api('/api/snapchat/status', { method: 'POST' }); setMsg(JSON.stringify(r)); } catch (e: any) { setMsg(e.message); } }} style={{ marginRight: 8, padding: '8px 16px' }}>Status</button>
            <button onClick={async () => { try { const r = await api('/api/snapchat/record-draft', { method: 'POST', body: JSON.stringify({ durationMs: 5000 }) }); setMsg(JSON.stringify(r)); } catch (e: any) { setMsg(e.message); } }} style={{ marginRight: 8, padding: '8px 16px' }}>Record draft</button>
            <button onClick={async () => { try { const r = await api('/api/snapchat/post-draft', { method: 'POST', body: JSON.stringify({}) }); setMsg(JSON.stringify(r)); } catch (e: any) { setMsg(e.message); } }} style={{ padding: '8px 16px' }}>Post draft</button>
          </div>
        )}

        {tab === 'onlyfans' && (
          <div>
            <h1>OnlyFans</h1>
            <a href="/onlyfans/ui" target="_blank" style={{ color: '#2997ff' }}>Open dashboard</a>
          </div>
        )}

        {tab === 'settings' && (
          <div>
            <h1>Settings</h1>
            <label>Label<br /><input value={label} onChange={e => setLabel(e.target.value)} style={{ padding: 8, width: 240, marginTop: 4 }} /></label>
            <div style={{ marginTop: 12 }}>
              <button onClick={signup} style={{ padding: '8px 16px', marginRight: 8 }}>Create user</button>
            </div>
            <label style={{ display: 'block', marginTop: 16 }}>API key<br />
              <input type="password" value={key} onChange={e => saveKey(e.target.value)} style={{ padding: 8, width: 360, marginTop: 4 }} />
            </label>
          </div>
        )}
      </main>
    </div>
  );
}
