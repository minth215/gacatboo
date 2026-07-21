import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

import { ensureAdmin } from './db.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import categoryRoutes from './routes/categories.js';
import sourceRoutes from './routes/sources.js';
import transactionRoutes from './routes/transactions.js';
import statsRoutes from './routes/stats.js';
import groupRoutes from './routes/groups.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

ensureAdmin();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/sources', sourceRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/groups', groupRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// 프로덕션: 빌드된 프론트엔드 정적 서빙
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

app.listen(PORT, () => console.log(`[server] http://localhost:${PORT} 에서 실행 중`));
