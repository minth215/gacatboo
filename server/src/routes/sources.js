import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// 원천 목록을 트리(부모 + children)로 반환
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM sources WHERE user_id = ? ORDER BY sort_order, id').all(req.user.id);
  const tops = rows.filter((r) => r.parent_id == null).map((t) => ({
    ...t,
    children: rows.filter((r) => r.parent_id === t.id),
  }));
  res.json({ sources: tops, flat: rows });
});

router.post('/', (req, res) => {
  const { name, parent_id } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: '이름을 입력하세요.' });
  let parent = null;
  if (parent_id) {
    parent = db.prepare('SELECT * FROM sources WHERE id = ? AND user_id = ?').get(parent_id, req.user.id);
    if (!parent) return res.status(404).json({ error: '상위 원천을 찾을 수 없습니다.' });
    if (parent.parent_id != null) return res.status(400).json({ error: '원천은 2단계까지만 지원합니다.' });
  }
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM sources WHERE user_id = ? AND parent_id IS ?').get(req.user.id, parent_id || null).m;
  const info = db.prepare('INSERT INTO sources (user_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?)').run(req.user.id, parent_id || null, name.trim(), max + 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/:id', (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: '이름을 입력하세요.' });
  const src = db.prepare('SELECT * FROM sources WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: '원천을 찾을 수 없습니다.' });
  db.prepare('UPDATE sources SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ message: '수정되었습니다.' });
});

router.delete('/:id', (req, res) => {
  const src = db.prepare('SELECT * FROM sources WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: '원천을 찾을 수 없습니다.' });
  db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id); // children cascade
  res.json({ message: '삭제되었습니다.' });
});

export default router;
