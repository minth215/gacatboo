import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db, { seedDefaultsForUser } from '../db.js';
import { signToken, requireAuth } from '../auth.js';

const router = Router();

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// 회원가입 신청 — 계정은 'pending' 상태로 생성되며 관리자 승인 후 로그인 가능.
router.post('/register', (req, res) => {
  const { username, password, display_name } = req.body || {};
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: '아이디, 비밀번호, 이름을 모두 입력하세요.' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });

  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare(
    "INSERT INTO users (username, password_hash, display_name, role, status) VALUES (?, ?, ?, 'user', 'pending')"
  ).run(username, hash, display_name);
  seedDefaultsForUser(info.lastInsertRowid);
  res.status(201).json({ message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' });
});

// 로그인 — 승인된 계정만 가능.
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  if (user.status !== 'approved') {
    const msg = user.status === 'pending'
      ? '아직 관리자 승인 대기 중인 계정입니다.'
      : '로그인이 거부된 계정입니다. 관리자에게 문의하세요.';
    return res.status(403).json({ error: msg });
  }
  const token = signToken(user);
  res.cookie('token', token, cookieOpts);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: '로그아웃 되었습니다.' });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, display_name, status FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({ user });
});

export default router;
