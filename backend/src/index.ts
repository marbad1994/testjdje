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

app.get('/api/health', (_req, res) => res.json({ ok: true, surface: 'dark-suite', db: 'postgres' }));

app.post('/api/signup', async (req, res) => {
  const label = String(req.body?.label || 'User').slice(0, 200);
  const key = randomBytes(32).toString('hex');
  const user = await prisma.user.create({ data: { label, keyHash: digest(key) } });
  res.status(201).json({ id: user.id, label: user.label, apiKey: key });
});

app.get('/api/status', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const connections = await prisma.connection.findMany({ where: { userId: user.id } });
  res.json({
    userId: user.id,
    label: user.label,
    surface: 'Dark Suite',
    onlyCreatorUrl: ONLYCREATOR,
    connections: connections.map(c => ({ platform: c.platform, status: c.status })),
  });
});

app.get('/api/connections', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const list = await prisma.connection.findMany({ where: { userId: user.id } });
  res.json(list);
});

app.post('/api/connections', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const platform = String(req.body?.platform || '').trim();
  if (!platform) return res.status(400).json({ error: 'platform required' });
  const conn = await prisma.connection.upsert({
    where: { userId_platform: { userId: user.id, platform } },
    update: { status: req.body?.status || 'connected', metadata: req.body?.metadata || {} },
    create: { userId: user.id, platform, status: req.body?.status || 'connected', metadata: req.body?.metadata || {} },
  });
  res.json(conn);
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
  const body = String(req.body?.body || req.body?.text || '').trim();
  const platform = String(req.body?.platform || 'reddit').trim();
  const target = String(req.body?.target || req.body?.subreddit || '').trim() || null;
  if (!title) return res.status(400).json({ error: 'Title required' });

  if (platform === 'snapchat') {
    return res.status(400).json({
      error: 'Snapchat has no organic posting API. Use Share to Snapchat (Creative Kit) from the client, or connect via Login Kit for identity only.',
      code: 'SNAPCHAT_NO_ORGANIC_API',
    });
  }

  const sub = await prisma.submission.create({
    data: {
      userId: user.id,
      platform,
      fingerprint: randomUUID(),
      title,
      body,
      target,
      state: 'queued',
    },
  });
  res.json({ id: sub.id, title: sub.title, platform: sub.platform, state: sub.state });
});

app.get('/api/schedule', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const items = await prisma.scheduled.findMany({ where: { userId: user.id }, orderBy: { scheduledAt: 'desc' } });
  res.json(items);
});

app.post('/api/schedule', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const platform = String(req.body?.platform || 'reddit');
  if (platform === 'snapchat') {
    return res.status(400).json({ error: 'Snapchat cannot be scheduled unattended. Use Creative Kit share flow.', code: 'SNAPCHAT_NO_SCHEDULE' });
  }
  const when = new Date(req.body?.scheduledAt);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'scheduledAt must be a valid future time' });
  }
  const item = await prisma.scheduled.create({
    data: {
      userId: user.id,
      platform,
      title: String(req.body?.title || 'Untitled'),
      body: String(req.body?.body || ''),
      scheduledAt: when,
    },
  });
  res.json(item);
});

app.get('/api/snapchat/info', (_req, res) => {
  res.json({
    organicPosting: false,
    loginKit: true,
    creativeKit: true,
    note: 'No public API for organic Snap/Story posting. Login Kit for identity. Creative Kit for user-initiated share.',
  });
});

app.post('/api/snapchat/connect', async (req, res) => {
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const conn = await prisma.connection.upsert({
    where: { userId_platform: { userId: user.id, platform: 'snapchat' } },
    update: { status: 'connected', metadata: { method: 'login-kit' } },
    create: { userId: user.id, platform: 'snapchat', status: 'connected', metadata: { method: 'login-kit' } },
  });
  res.json({ connected: true, connection: conn });
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
app.listen(port, '0.0.0.0', () => console.log(`Dark Suite backend on ${port}`));
