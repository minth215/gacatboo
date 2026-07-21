import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// 월별 개인 통계: 수입/지출 합계 + 분류별 집계 + 최근 6개월 추이
router.get('/monthly', (req, res) => {
  const { month } = req.query;
  if (!/^\d{4}-\d{2}$/.test(month || '')) return res.status(400).json({ error: 'month(YYYY-MM) 파라미터가 필요합니다.' });
  const start = `${month}-01`;
  const end = `${month}-31`;

  const base = `FROM transactions WHERE user_id = ? AND group_id IS NULL AND date BETWEEN ? AND ?`;
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense
    ${base}
  `).get(req.user.id, start, end);
  totals.balance = totals.income - totals.expense;

  const byCategory = (type) => db.prepare(`
    SELECT COALESCE(NULLIF(category_name,''),'미분류') AS name, SUM(amount) AS total, COUNT(*) AS count
    ${base} AND type = ?
    GROUP BY name ORDER BY total DESC
  `).all(req.user.id, start, end, type);

  // 최근 6개월 추이
  const trend = [];
  const [y, m] = month.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const mm = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const t = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense
      FROM transactions WHERE user_id = ? AND group_id IS NULL AND date BETWEEN ? AND ?
    `).get(req.user.id, `${mm}-01`, `${mm}-31`);
    trend.push({ month: mm, income: t.income, expense: t.expense });
  }

  res.json({
    month,
    totals,
    incomeByCategory: byCategory('income'),
    expenseByCategory: byCategory('expense'),
    trend,
  });
});

export default router;
