import { useEffect, useState } from 'react';

const s = {
  root: { display: 'flex', minHeight: '100vh', background: '#0a0a0b', color: '#f5f5f7', fontFamily: 'Inter, system-ui, sans-serif' },
  aside: { width: 240, background: '#111113', borderRight: '1px solid rgba(255,255,255,.08)', padding: '28px 16px', display: 'flex', flexDirection: 'column' as const },
  brand: { fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', marginBottom: 4 },
  brandSub: { fontSize: 11, color: '#a1a1a6', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 28 },
  navBtn: (on: boolean) => ({
    display: 'block', width: '100%', textAlign: 'left' as const, background: on ? 'rgba(255,255,255,.08)' : 'transparent',
    color: on ? '#fff' : '#a1a1a6', border: 0, padding: '11px 14px', borderRadius: 10, marginBottom: 4, fontWeight: 600, fontSize: 14, cursor: 'pointer'
  }),
  main: { flex: 1, padding: '32px 40px', maxWidth: 1100 },
  h1: { fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 8px' },
  sub: { color: '#a1a1a6', marginBottom: 28, fontSize: 15, lineHeight: 1.5 },
  card: { background: 'rgba(22,22,24,.85)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 24, marginBottom: 20 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, margin: '16px 0 6px' },
  input: { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', background: '#111', color: '#fff', fontSize: 14.5, boxSizing: 'border-box' as const },
  textarea: { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', background: '#111', color: '#fff', fontSize: 14.5, minHeight: 110, resize: 'vertical' as const, boxSizing: 'border-box' as const },
  btn: (primary = false) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 999, border: '1px solid transparent',
    background: primary ? '#f5f5f7' : 'rgba(255,255,255,.08)', color: primary ? '#000' : '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginRight: 10
  }),
  notice: { background: 'rgba(48,209,88,.12)', color: '#30d158', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 },
  error: { background: 'rgba(255,69,58,.12)', color: '#ff453a', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 },
  item: { border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 14, marginBottom: 10, background: '#111' },
  tag: { display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,.08)', marginRight: 8 },
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
  const [schedule, setSchedule] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [label, setLabel] = useState('Dev user');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [platform, setPlatform] = useState('reddit');
  const [target, setTarget] = useState('');
  const [when, setWhen] = useState('');

  const load = async () => {
    if (!key) return;
    try {
      const [st, h, sc, c] = await Promise.all([
        api('/api/status'),
        api('/api/history'),
        api('/api/schedule'),
        api('/api/connections'),
      ]);
      setStatus(st); setHistory(h || []); setSchedule(sc || []); setConnections(c || []);
      setErr('');
    } catch (e: any) { setStatus(null); setErr(e.message); }
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
      const r = await api('/api/publish', { method: 'POST', body: JSON.stringify({ title, body, platform, target }) });
      setMsg(`Queued on ${r.platform}: ${r.id}`);
      setTitle(''); setBody('');
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const doSchedule = async () => {
    setErr(''); setMsg('');
    try {
      const r = await api('/api/schedule', { method: 'POST', body: JSON.stringify({ title, body, platform, scheduledAt: when }) });
      setMsg(`Scheduled for ${new Date(r.scheduledAt).toLocaleString()}`);
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const connectSnap = async () => {
    setErr(''); setMsg('');
    try {
      await api('/api/snapchat/connect', { method: 'POST' });
      setMsg('Snapchat connection recorded (Login Kit style). Organic posting is not available.');
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'compose', label: 'Compose' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'history', label: 'History' },
    { id: 'connections', label: 'Connections' },
    { id: 'snapchat', label: 'Snapchat' },
    { id: 'onlyfans', label: 'OnlyFans' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div style={s.root}>
      <aside style={s.aside}>
        <div style={s.brand}>Dark Suite</div>
        <div style={s.brandSub}>Isolated surface</div>
        {tabs.map(t => (
          <button key={t.id} style={s.navBtn(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
        <div style={{ marginTop: 'auto', fontSize: 11, color: '#a1a1a6', paddingTop: 20 }}>Per architecture plan</div>
      </aside>
      <main style={s.main}>
        {msg && <div style={s.notice}>{msg}</div>}
        {err && <div style={s.error}>{err}</div>}

        {tab === 'dashboard' && (
          <>
            <h1 style={s.h1}>Dashboard</h1>
            <p style={s.sub}>Dark Suite — higher-risk surface. Shared core patterns, isolated data.</p>
            <div style={s.card}>
              {status ? (
                <>
                  <div style={{ marginBottom: 8 }}><strong>User</strong> · {status.label}</div>
                  <div style={{ marginBottom: 8 }}><strong>ID</strong> · {status.userId}</div>
                  <div><strong>Connections</strong> · {status.connections?.length || 0}</div>
                </>
              ) : <p>Create an account in Settings.</p>}
              <button style={{ ...s.btn(), marginTop: 16 }} onClick={load}>Refresh</button>
            </div>
            <div style={s.card}>
              <h3 style={{ marginTop: 0 }}>Recent</h3>
              {history.slice(0, 5).map((h: any) => (
                <div key={h.id} style={s.item}>
                  <span style={s.tag}>{h.platform}</span>
                  <strong>{h.title}</strong>
                  <div style={{ color: '#a1a1a6', fontSize: 13, marginTop: 4 }}>{h.state} · {new Date(h.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {history.length === 0 && <p style={{ color: '#a1a1a6' }}>No activity yet.</p>}
            </div>
          </>
        )}

        {tab === 'compose' && (
          <>
            <h1 style={s.h1}>Compose</h1>
            <p style={s.sub}>Queue a post. Snapchat is blocked — no organic API.</p>
            <div style={s.card}>
              <label style={s.label}>Platform</label>
              <select style={s.input} value={platform} onChange={e => setPlatform(e.target.value)}>
                <option value="reddit">Reddit</option>
                <option value="onlyfans">OnlyFans</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="snapchat">Snapchat (blocked)</option>
              </select>
              <label style={s.label}>Title</label>
              <input style={s.input} value={title} onChange={e => setTitle(e.target.value)} />
              <label style={s.label}>Body</label>
              <textarea style={s.textarea} value={body} onChange={e => setBody(e.target.value)} />
              <label style={s.label}>Target (subreddit, chat, etc.)</label>
              <input style={s.input} value={target} onChange={e => setTarget(e.target.value)} />
              <div style={{ marginTop: 20 }}>
                <button style={s.btn(true)} onClick={publish} disabled={!key}>Queue post</button>
              </div>
            </div>
          </>
        )}

        {tab === 'schedule' && (
          <>
            <h1 style={s.h1}>Schedule</h1>
            <p style={s.sub}>Schedule for platforms that support unattended posting. Snapchat does not.</p>
            <div style={s.card}>
              <label style={s.label}>Platform</label>
              <select style={s.input} value={platform} onChange={e => setPlatform(e.target.value)}>
                <option value="reddit">Reddit</option>
                <option value="onlyfans">OnlyFans</option>
              </select>
              <label style={s.label}>Title</label>
              <input style={s.input} value={title} onChange={e => setTitle(e.target.value)} />
              <label style={s.label}>Body</label>
              <textarea style={s.textarea} value={body} onChange={e => setBody(e.target.value)} />
              <label style={s.label}>When</label>
              <input style={s.input} type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
              <div style={{ marginTop: 20 }}>
                <button style={s.btn(true)} onClick={doSchedule} disabled={!key}>Schedule</button>
              </div>
            </div>
            {schedule.map((it: any) => (
              <div key={it.id} style={s.item}>
                <span style={s.tag}>{it.platform}</span>
                <strong>{it.title}</strong>
                <div style={{ color: '#a1a1a6', fontSize: 13 }}>{it.state} · {new Date(it.scheduledAt).toLocaleString()}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'history' && (
          <>
            <h1 style={s.h1}>History</h1>
            {history.map((h: any) => (
              <div key={h.id} style={s.item}>
                <span style={s.tag}>{h.platform}</span>
                <strong>{h.title}</strong>
                <div style={{ color: '#a1a1a6', fontSize: 13, marginTop: 4 }}>{h.state} · {h.target || '—'} · {new Date(h.createdAt).toLocaleString()}</div>
                {h.body && <p style={{ margin: '8px 0 0', fontSize: 14 }}>{h.body.slice(0, 180)}{h.body.length > 180 ? '…' : ''}</p>}
              </div>
            ))}
            {history.length === 0 && <p style={{ color: '#a1a1a6' }}>Empty.</p>}
          </>
        )}

        {tab === 'connections' && (
          <>
            <h1 style={s.h1}>Connections</h1>
            <p style={s.sub}>Identity Hub pattern, scoped to Dark Suite.</p>
            {connections.map((c: any) => (
              <div key={c.id} style={s.item}>
                <span style={s.tag}>{c.platform}</span>
                <strong>{c.status}</strong>
              </div>
            ))}
            {connections.length === 0 && <p style={{ color: '#a1a1a6' }}>No connections yet.</p>}
          </>
        )}

        {tab === 'snapchat' && (
          <>
            <h1 style={s.h1}>Snapchat</h1>
            <p style={s.sub}>Per the plan: no organic posting API. Login Kit for identity. Creative Kit for user-initiated share.</p>
            <div style={s.card}>
              <p>You cannot schedule a Snap or Story that posts while the user is offline. That is how Snap’s platform works.</p>
              <button style={s.btn(true)} onClick={connectSnap} disabled={!key}>Connect (Login Kit style)</button>
            </div>
          </>
        )}

        {tab === 'onlyfans' && (
          <>
            <h1 style={s.h1}>OnlyFans</h1>
            <p style={s.sub}>Integrated OnlyCreatorAPI — accounts, chats, subscribers, earnings, vault.</p>
            <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <iframe
                src="/onlyfans/ui"
                title="OnlyCreatorAPI"
                style={{ width: '100%', height: '75vh', border: 0, background: '#111' }}
              />
            </div>
            <p style={{ color: '#a1a1a6', fontSize: 13, marginTop: 8 }}>
              Default API key: <code>darksuite-dev-key</code> (set in compose). Health: <a href="/onlyfans/api/health" style={{ color: '#2997ff' }}>/onlyfans/api/health</a>
            </p>
          </>
        )}

        {tab === 'settings' && (
          <>
            <h1 style={s.h1}>Settings</h1>
            <div style={s.card}>
              <label style={s.label}>Display name</label>
              <input style={s.input} value={label} onChange={e => setLabel(e.target.value)} />
              <div style={{ marginTop: 16 }}>
                <button style={s.btn(true)} onClick={signup}>Create account</button>
              </div>
            </div>
            <div style={s.card}>
              <label style={s.label}>API key</label>
              <input style={s.input} type="password" value={key} onChange={e => saveKey(e.target.value)} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
