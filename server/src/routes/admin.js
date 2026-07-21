import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db, { seedDefaultsForUser } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// 전체 회원 목록
router.get('/users', (req, res) => {
  const users = db.prepare(
    "SELECT id, username, display_name, role, status, created_at FROM users ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC"
  ).all();
  res.json({ users });
});

// 관리자가 계정 직접 생성 (즉시 승인 상태)
router.post('/users', (req, res) => {
  const { username, password, display_name, role } = req.body || {};
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: '아이디, 비밀번호, 이름을 모두 입력하세요.' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });

  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare(
    "INSERT INTO users (username, password_hash, display_name, role, status) VALUES (?, ?, ?, ?, 'approved')"
  ).run(username, hash, display_name, role === 'admin' ? 'admin' : 'user');
  seedDefaultsForUser(info.lastInsertRowid);
  res.status(201).json({ message: '계정이 생성되었습니다.', id: info.lastInsertRowid });
});

// 계정 상태 변경 (승인/거부/대기)
router.patch('/users/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: '잘못된 상태값입니다.' });
  }
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: '상태가 변경되었습니다.' });
});

// 역할 변경 (admin/user)
router.patch('/users/:id/role', (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: '잘못된 역할입니다.' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (target.role === 'admin' && role === 'user') {
    const adminCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: '최소 한 명의 관리자가 필요합니다.' });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ message: '역할이 변경되었습니다.' });
});

// 계정 삭제
router.delete('/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: '본인 계정은 삭제할 수 없습니다.' });
  }
  if (target.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: '최소 한 명의 관리자가 필요합니다.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: '계정이 삭제되었습니다.' });
});

export default router;
