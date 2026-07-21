import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

const GROUP_CATEGORIES = ['여행', '구독', '동거', 'N빵', '기타'];

function isMember(groupId, userId) {
  return !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}
function isOwner(groupId, userId) {
  return !!db.prepare("SELECT 1 FROM groups WHERE id = ? AND owner_id = ?").get(groupId, userId);
}

// 내가 속한 그룹 목록
router.get('/', (req, res) => {
  const groups = db.prepare(`
    SELECT g.*, u.display_name AS owner_name,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
    FROM groups g
    JOIN group_members m ON m.group_id = g.id AND m.user_id = ?
    JOIN users u ON u.id = g.owner_id
    ORDER BY g.created_at DESC
  `).all(req.user.id);
  res.json({ groups });
});

// 그룹 생성 — 생성자가 총무(owner)
router.post('/', (req, res) => {
  const { name, description, category } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: '그룹명을 입력하세요.' });
  const cat = GROUP_CATEGORIES.includes(category) ? category : '기타';
  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO groups (name, description, category, owner_id) VALUES (?, ?, ?, ?)')
      .run(name.trim(), (description || '').trim(), cat, req.user.id);
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')").run(info.lastInsertRowid, req.user.id);
    return info.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json({ id });
});

// 그룹 상세 (멤버 포함)
router.get('/:id', (req, res) => {
  const g = db.prepare('SELECT g.*, u.display_name AS owner_name FROM groups g JOIN users u ON u.id = g.owner_id WHERE g.id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
  if (!isMember(g.id, req.user.id)) return res.status(403).json({ error: '그룹 멤버가 아닙니다.' });
  const members = db.prepare(`
    SELECT gm.user_id, gm.role, u.display_name, u.username
    FROM group_members gm JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? ORDER BY (gm.role = 'owner') DESC, u.display_name
  `).all(g.id);
  res.json({ group: g, members });
});

// 멤버 추가 (총무만) — username 으로 추가
router.post('/:id/members', (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
  if (!isOwner(g.id, req.user.id)) return res.status(403).json({ error: '총무만 멤버를 추가할 수 있습니다.' });
  const { username } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND status = 'approved'").get(username);
  if (!user) return res.status(404).json({ error: '승인된 사용자를 찾을 수 없습니다.' });
  if (isMember(g.id, user.id)) return res.status(409).json({ error: '이미 멤버입니다.' });
  db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(g.id, user.id);
  res.status(201).json({ message: '멤버가 추가되었습니다.' });
});

// 멤버 제거 (총무만, 본인=총무는 제거 불가)
router.delete('/:id/members/:userId', (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
  if (!isOwner(g.id, req.user.id)) return res.status(403).json({ error: '총무만 멤버를 제거할 수 있습니다.' });
  if (Number(req.params.userId) === g.owner_id) return res.status(400).json({ error: '총무는 제거할 수 없습니다.' });
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(g.id, req.params.userId);
  res.json({ message: '멤버가 제거되었습니다.' });
});

// 그룹 삭제 (총무만)
router.delete('/:id', (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
  if (!isOwner(g.id, req.user.id)) return res.status(403).json({ error: '총무만 그룹을 삭제할 수 있습니다.' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  res.json({ message: '그룹이 삭제되었습니다.' });
});

// 그룹 통계 (월별, 멤버별 집계 포함)
router.get('/:id/stats', (req, res) => {
  const { month } = req.query;
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
  if (!isMember(g.id, req.user.id)) return res.status(403).json({ error: '그룹 멤버가 아닙니다.' });
  if (!/^\d{4}-\d{2}$/.test(month || '')) return res.status(400).json({ error: 'month(YYYY-MM) 파라미터가 필요합니다.' });
  const start = `${month}-01`;
  const end = `${month}-31`;

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense
    FROM transactions WHERE group_id = ? AND date BETWEEN ? AND ?
  `).get(g.id, start, end);
  totals.balance = totals.income - totals.expense;

  // 멤버별 집계 (작성 기준)
  const byMember = db.prepare(`
    SELECT u.display_name AS name,
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount END),0) AS income,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount END),0) AS expense
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    LEFT JOIN transactions t ON t.user_id = gm.user_id AND t.group_id = gm.group_id AND t.date BETWEEN ? AND ?
    WHERE gm.group_id = ?
    GROUP BY gm.user_id ORDER BY expense DESC
  `).all(start, end, g.id);

  const byCategory = db.prepare(`
    SELECT COALESCE(NULLIF(category_name,''),'미분류') AS name, SUM(amount) AS total
    FROM transactions WHERE group_id = ? AND type='expense' AND date BETWEEN ? AND ?
    GROUP BY name ORDER BY total DESC
  `).all(g.id, start, end);

  res.json({ totals, byMember, byCategory });
});

export default router;
