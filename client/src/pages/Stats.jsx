import { useEffect, useState, useCallback } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { PALETTE } from '../lib/chartSetup.js';
import { currentMonth, shiftMonth, monthLabel, fmtWon } from '../lib/format.js';

export default function Stats() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('expense'); // expense | income

  const load = useCallback(() => {
    db.personalStats(month, user.id).then(setData).catch(() => setData(null));
  }, [month, user.id]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="empty">불러오는 중…</div>;

  const { totals, trend, incomeByCategory, expenseByCategory } = data;
  const byCat = tab === 'expense' ? expenseByCategory : incomeByCategory;

  const trendData = {
    labels: trend.map((t) => `${Number(t.month.slice(5))}월`),
    datasets: [
      { label: '수입', data: trend.map((t) => t.income), backgroundColor: '#2563eb', borderRadius: 6, maxBarThickness: 22 },
      { label: '지출', data: trend.map((t) => t.expense), backgroundColor: '#e5484d', borderRadius: 6, maxBarThickness: 22 },
    ],
  };

  const doughnut = {
    labels: byCat.map((c) => c.name),
    datasets: [{ data: byCat.map((c) => c.total), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }],
  };

  const totalCat = byCat.reduce((s, c) => s + c.total, 0);

  return (
    <div>
      <div className="month-nav">
        <button onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <div className="mlabel">{monthLabel(month)}</div>
        <button onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      <div className="summary" style={{ marginBottom: 16 }}>
        <div className="box"><div className="lbl">수입</div><div className="val income">{fmtWon(totals.income)}</div></div>
        <div className="box"><div className="lbl">지출</div><div className="val expense">{fmtWon(totals.expense)}</div></div>
        <div className="box"><div className="lbl">합계</div><div className="val">{fmtWon(totals.balance)}</div></div>
      </div>

      <div className="card">
        <h3>최근 6개월 추이</h3>
        <div className="chart-box">
          <Bar data={trendData} options={{
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } } },
            scales: { y: { ticks: { callback: (v) => (v >= 10000 ? `${v / 10000}만` : v) } } },
          }} />
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>분류별 {tab === 'expense' ? '지출' : '수입'}</h3>
          <div className="pill-toggle">
            <button className={tab === 'income' ? 'income active' : ''} onClick={() => setTab('income')}>수입</button>
            <button className={tab === 'expense' ? 'expense active' : ''} onClick={() => setTab('expense')}>지출</button>
          </div>
        </div>

        {byCat.length === 0 ? (
          <div className="empty">해당 월 데이터가 없습니다.</div>
        ) : (
          <>
            <div className="chart-box">
              <Doughnut data={doughnut} options={{
                responsive: true, maintainAspectRatio: false, cutout: '62%',
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${fmtWon(c.raw)}` } } },
              }} />
            </div>
            <div className="legend-list">
              {byCat.map((c, i) => (
                <div className="legend-row" key={c.name}>
                  <span className="sw" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="lname">{c.name}</span>
                  <span className="muted small">{totalCat ? Math.round((c.total / totalCat) * 100) : 0}%</span>
                  <span className="lval">{fmtWon(c.total)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
