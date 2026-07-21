import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function isMember(groupId, userId) {
  return !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

// 원천/분류의 스냅샷 이름을 조회 (작성자 본인 소유 검증)
function resolveNames(userId, categoryId, sourceId) {
  let category_name = '';
  let source_name = '';
  if (categoryId) {
    const c = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(categoryId, userId);
    if (c) category_name = c.name;
  }
  if (sourceId) {
    const s = db.prepare('SELECT * FROM sources WHERE id = ? AND user_id = ?').get(sourceId, userId);
    if (s) {
      const parent = s.parent_id ? db.prepare('SELECT name FROM sources WHERE id = ?').get(s.parent_id) : null;
      source_name = parent ? `${parent.name} > ${s.name}` : s.name;
    }
  }
  return { category_name, source_name };
}

const SELECT_TX = `
  SELECT t.*, g.name AS group_name, u.display_name AS author_name
  FROM transactions t
  LEFT JOIN groups g ON g.id = t.group_id
  LEFT JOIN users u ON u.id = t.user_id
`;

// 목록: month=YYYY-MM 필수. group_id 지정 시 해당 그룹 항목, 없으면 개인+참여그룹 반영 항목.
router.get('/', (req, res) => {
  const { month, group_id } = req.query;
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    return res.status(400).json({ error: 'month(YYYY-MM) 파라미터가 필요합니다.' });
  }
  const start = `${month}-01`;
  const end = `${month}-31`;

  let rows;
  if (group_id) {
    if (!isMember(group_id, req.user.id)) return res.status(403).json({ error: '그룹 멤버가 아닙니다.' });
    rows = db.prepare(`${SELECT_TX} WHERE t.group_id = ? AND t.date BETWEEN ? AND ? ORDER BY t.date DESC, t.id DESC`)
      .all(group_id, start, end);
  } else {
    // 개인 항목 + 내가 속한 그룹의 항목(가계부에 반영)
    rows = db.prepare(`
      ${SELECT_TX}
      WHERE t.date BETWEEN ? AND ? AND (
        (t.group_id IS NULL AND t.user_id = ?)
        OR (t.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))
      )
      ORDER BY t.date DESC, t.id DESC
    `).all(start, end, req.user.id, req.user.id);
  }
  res.json({ transactions: rows });
});

router.post('/', (req, res) => {
  const { type, date, amount, category_id, source_id, content, memo, group_id } = req.body || {};
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: '수입/지출 종류를 선택하세요.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: '금액을 확인하세요.' });

  if (group_id && !isMember(group_id, req.user.id)) {
    return res.status(403).json({ error: '그룹 멤버가 아닙니다.' });
  }

  const { category_name, source_name } = resolveNames(req.user.id, category_id, source_id);
  const info = db.prepare(`
    INSERT INTO transactions
      (user_id, group_id, type, date, amount, category_id, category_name, source_id, source_name, content, memo, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, group_id || null, type, date, amt,
    category_id || null, category_name, source_id || null, source_name,
    (content || '').trim(), (memo || '').trim(), req.user.id
  );
  const row = db.prepare(`${SELECT_TX} WHERE t.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ transaction: row });
});

router.put('/:id', (req, res) => {
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!tx) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
  // 개인 항목은 본인, 그룹 항목은 작성자만 수정 가능
  const canEdit = tx.group_id ? tx.created_by === req.user.id : tx.user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: '수정 권한이 없습니다.' });

  const { type, date, amount, category_id, source_id, content, memo } = req.body || {};
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: '수입/지출 종류를 선택하세요.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: '금액을 확인하세요.' });

  const { category_name, source_name } = resolveNames(tx.user_id, category_id, source_id);
  db.prepare(`
    UPDATE transactions SET type=?, date=?, amount=?, category_id=?, category_name=?, source_id=?, source_name=?, content=?, memo=?
    WHERE id=?
  `).run(type, date, amt, category_id || null, category_name, source_id || null, source_name,
    (content || '').trim(), (memo || '').trim(), req.params.id);
  const row = db.prepare(`${SELECT_TX} WHERE t.id = ?`).get(req.params.id);
  res.json({ transaction: row });
});

router.delete('/:id', (req, res) => {
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!tx) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
  const canEdit = tx.group_id ? tx.created_by === req.user.id : tx.user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ message: '삭제되었습니다.' });
});

export default router;
