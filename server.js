'use strict';

const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BANNER_FILE = path.join(DATA_DIR, 'banner.json');
const PUSHBULLET_TOKEN = (process.env.PUSHBULLET_ACCESS_TOKEN || '').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '12kb' }));
app.use(express.urlencoded({ extended: false, limit: '12kb' }));

// Lightweight in-memory rate limits. They reset when the container restarts.
const visitorLastRequest = new Map();
const adminFailures = new Map();
function clientKey(req) {
  return String(req.ip || req.socket.remoteAddress || 'unknown').slice(0, 100);
}
function isRateLimited(map, key, durationMs, maxEntries = 5000) {
  const now = Date.now();
  const previous = map.get(key);
  if (previous && now - previous < durationMs) return true;
  map.set(key, now);
  if (map.size > maxEntries) {
    for (const [entryKey, timestamp] of map) {
      if (now - timestamp > durationMs * 2) map.delete(entryKey);
      if (map.size <= maxEntries * 0.8) break;
    }
  }
  return false;
}

async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(BANNER_FILE);
  } catch {
    await fs.writeFile(BANNER_FILE, JSON.stringify({
      message: 'Chào mừng bạn đến với website cá nhân của mình! ✨',
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
  }
}

async function readBanner() {
  try {
    const raw = await fs.readFile(BANNER_FILE, 'utf8');
    const value = JSON.parse(raw);
    return {
      message: typeof value.message === 'string' ? value.message : 'Xin chào!',
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
    };
  } catch (error) {
    console.error('Could not read banner data:', error.message);
    return { message: 'Xin chào!', updatedAt: null };
  }
}

async function writeBanner(message) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = `${BANNER_FILE}.${process.pid}.tmp`;
  const data = { message, updatedAt: new Date().toISOString() };
  await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temporaryFile, BANNER_FILE);
  return data;
}

function constantTimeStringEqual(received, expected) {
  const receivedBuffer = Buffer.from(String(received));
  const expectedBuffer = Buffer.from(String(expected));
  if (receivedBuffer.length !== expectedBuffer.length || expectedBuffer.length === 0) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  const key = clientKey(req);
  if (isRateLimited(adminFailures, key, 1000, 10000)) {
    return res.status(429).json({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' });
  }
  if (!ADMIN_PASSWORD || !constantTimeStringEqual(req.get('x-admin-password') || '', ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Mật khẩu quản trị không đúng hoặc chưa được cấu hình.' });
  }
  adminFailures.delete(key);
  next();
}

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/api/banner', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await readBanner());
});

app.post('/api/messages', async (req, res) => {
  const key = clientKey(req);
  if (isRateLimited(visitorLastRequest, key, 30_000)) {
    return res.status(429).json({ error: 'Bạn vừa gửi một thông điệp. Hãy đợi khoảng 30 giây rồi thử lại nhé.' });
  }

  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const sender = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  if (!message) return res.status(400).json({ error: 'Bạn hãy nhập nội dung thông điệp.' });
  if (message.length > 500) return res.status(400).json({ error: 'Thông điệp tối đa 500 ký tự.' });

  if (!PUSHBULLET_TOKEN) {
    return res.status(503).json({ error: 'Website chưa cấu hình Pushbullet. Quản trị viên cần thêm PUSHBULLET_ACCESS_TOKEN vào file .env.' });
  }

  const title = sender ? `Thông điệp mới từ website — ${sender}` : 'Bạn có thông điệp mới từ website';
  try {
    const response = await fetch('https://api.pushbullet.com/v2/pushes', {
      method: 'POST',
      headers: {
        'Access-Token': PUSHBULLET_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'note', title, body: message }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      const safeStatus = response.status;
      console.error(`Pushbullet returned HTTP ${safeStatus}`);
      return res.status(502).json({ error: 'Không gửi được thông báo tới điện thoại. Hãy thử lại sau.' });
    }
    return res.status(201).json({ ok: true, message: 'Đã gửi thông điệp đến điện thoại của chủ website. Cảm ơn bạn!' });
  } catch (error) {
    console.error('Pushbullet request failed:', error.name || 'Error');
    return res.status(502).json({ error: 'Không kết nối được dịch vụ thông báo. Hãy thử lại sau.' });
  }
});

app.post('/api/admin/banner', requireAdmin, async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Nội dung banner không được để trống.' });
  if (message.length > 240) return res.status(400).json({ error: 'Lời nhắn banner tối đa 240 ký tự.' });
  try {
    const result = await writeBanner(message);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Could not save banner:', error.message);
    return res.status(500).json({ error: 'Không lưu được banner. Kiểm tra quyền ghi thư mục data.' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.use((req, res) => {
  res.status(404).send('Không tìm thấy trang này. <a href="/">Quay lại trang chủ</a>.');
});

ensureData().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BT-02 website is listening on 0.0.0.0:${PORT}`);
    console.log(`Pushbullet: ${PUSHBULLET_TOKEN ? 'configured' : 'not configured'}`);
    console.log(`Admin endpoint: ${ADMIN_PASSWORD ? 'enabled' : 'disabled until ADMIN_PASSWORD is set'}`);
  });
}).catch((error) => {
  console.error('Application startup failed:', error);
  process.exit(1);
});
