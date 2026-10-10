import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const ONLYCREATOR = process.env.ONLYCREATOR_API_URL || 'http://127.0.0.1:3001';

function digest(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

async function auth(req: express.Request) {
  const header = req.headers.authorization?.replace(/^Bearer /, '');
  if (!header) return null;
  return prisma.user.findUnique({ where: { keyHash: digest(header) } });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, db: 'postgres' }));

app.post('/api/signup', async (req, res) => {
  const label = String(req.body?.label || 'User').slice(0, 200);
  const key = randomBytes(32).toString('hex');
  const user = await prisma.user.create({ data: { label, keyHash: digest(key) } });
  res.status(201).json({ id: user.id, label: user.label, apiKey: key });
});

app.get('/api/status', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    userId: user.id,
    label: user.label,
    onlyCreatorUrl: ONLYCREATOR,
    snapchat: { connected: false },
  });
});

app.get('/api/history', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const items = await prisma.submission.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(items);
});

app.post('/api/publish', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const title = String(req.body?.title || '').trim();
  const text = String(req.body?.text || '').trim();
  const subreddit = String(req.body?.subreddit || 'draft').trim();
  if (!title) return res.status(400).json({ error: 'Title required' });
  const sub = await prisma.submission.create({
    data: {
      userId: user.id,
      fingerprint: randomUUID(),
      title,
      subreddit,
      state: 'published',
      redditUrl: null,
    },
  });
  res.json({ id: sub.id, title: sub.title, state: sub.state });
});

app.get('/api/analytics', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const rows = await prisma.submission.groupBy({
    by: ['subreddit'],
    where: { userId: user.id },
    _count: true,
  });
  res.json(rows);
});

app.post('/api/snapchat/status', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ connected: false, serial: process.env.SNAPCHAT_ADB_SERIAL || 'none' });
});

app.post('/api/snapchat/record-draft', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ saved: true, note: 'Stub — connect emulator for real recording', durationMs: req.body?.durationMs || 5000 });
});

app.post('/api/snapchat/post-draft', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ posted: true, note: 'Stub — connect emulator for real posting' });
});

app.use('/onlyfans', (req, res) => {
  const target = new URL(ONLYCREATOR);
  const path = req.url || '/';
  const http = require('http');
  const https = require('https');
  const proxyReq = (target.protocol === 'https:' ? https : http).request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (proxyRes: any) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', (err: any) => {
    if (!res.headersSent) res.status(502).json({ error: 'OnlyCreatorAPI unavailable: ' + err.message });
  });
  req.pipe(proxyReq);
});

const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => console.log(`Backend listening on ${port}`));
