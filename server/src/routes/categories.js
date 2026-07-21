import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// 분류 목록 (type=income|expense 로 필터 가능)
router.get('/', (req, res) => {
  const { type } = req.query;
  let rows;
  if (type === 'income' || type === 'expense') {
    rows = db.prepare('SELECT * FROM categories WHERE user_id = ? AND type = ? ORDER BY sort_order, id').all(req.user.id, type);
  } else {
    rows = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, sort_order, id').all(req.user.id);
  }
  res.json({ categories: rows });
});

router.post('/', (req, res) => {
  const { type, name } = req.body || {};
  if (!['income', 'expense'].includes(type) || !name?.trim()) {
    return res.status(400).json({ error: '분류 종류와 이름을 확인하세요.' });
  }
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM categories WHERE user_id = ? AND type = ?').get(req.user.id, type).m;
  const info = db.prepare('INSERT INTO categories (user_id, type, name, sort_order) VALUES (?, ?, ?, ?)').run(req.user.id, type, name.trim(), max + 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/:id', (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: '이름을 입력하세요.' });
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!cat) return res.status(404).json({ error: '분류를 찾을 수 없습니다.' });
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ message: '수정되었습니다.' });
});

router.delete('/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!cat) return res.status(404).json({ error: '분류를 찾을 수 없습니다.' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ message: '삭제되었습니다.' });
});

export default router;
