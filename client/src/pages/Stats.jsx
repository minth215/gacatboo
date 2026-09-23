import { useEffect, useState, useCallback } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { PALETTE } from '../lib/chartSetup.js';
import { currentMonth, shiftMonth, fmtWon, fmtNum } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import CatMascot from '../components/CatMascot.jsx';

const EMPTY = {
  totals: { income: 0, expense: 0, balance: 0 },
  incomeByCategory: [], expenseByCategory: [], incomeBySource: [], expenseBySource: [], grossBySourceId: {},
};

const roundBtn = (size = 36) => ({
  width: size, height: size, borderRadius: '50%', border: 'none', background: '#fff',
  boxShadow: '0 3px 12px rgba(25,23,34,.1)', cursor: 'pointer', color: '#6c6779',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none',
});

export default function Stats() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('expense'); // expense | income
  const [statView, setStatView] = useState('category'); // category | source

  const load = useCallback(() => {
    setLoading(true);
    db.personalStats(month, user.id)
      .then(setData)
      .catch((e) => { console.error(e); setData(EMPTY); })
      .finally(() => setLoading(false));
  }, [month, user.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { db.listCardBenefits().then(setTiers).catch(() => setTiers([])); }, []);

  if (loading && !data) return <div className="empty">불러오는 중…</div>;
  const view = data || EMPTY;
  const { totals, incomeByCategory, expenseByCategory, incomeBySource, expenseBySource, grossBySourceId } = view;
  const byCat = tab === 'expense' ? expenseByCategory : incomeByCategory;
  const bySrc = tab === 'expense' ? expenseBySource : incomeBySource;

  // source_id 별 카드 실적 구간
  const tiersBySource = {};
  tiers.forEach((t) => { (tiersBySource[t.source_id] ||= []).push(t); });
  Object.values(tiersBySource).forEach((arr) => arr.sort((a, b) => a.threshold - b.threshold));

  const doughnut = {
    labels: byCat.map((c) => c.name),
    datasets: [{ data: byCat.map((c) => c.total), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }],
  };
  const totalCat = byCat.reduce((s, c) => s + c.total, 0);
  const totalSrc = bySrc.reduce((s, c) => s + c.total, 0);

  const cardProgress = (sourceId) => {
    const arr = tiersBySource[sourceId];
    if (!arr || !arr.length) return null;
    const gross = grossBySourceId[sourceId] || 0;
    const achieved = [...arr].filter((t) => gross >= Number(t.threshold)).pop();
    const next = arr.find((t) => gross < Number(t.threshold));
    const ratio = next ? Math.min(100, Math.round((gross / Number(next.threshold)) * 100)) : 100;
    return (
      <div style={{ margin: '4px 0 10px', paddingLeft: 20 }}>
        <div className="prog"><i style={{ width: `${ratio}%` }} /></div>
        <div className="small muted" style={{ marginTop: 4 }}>
          사용 {fmtWon(gross)}
          {achieved ? ` · ✅ ${achieved.benefit || '혜택'}` : ''}
          {next ? ` · 다음 ${next.benefit || '혜택'}까지 ${fmtWon(Number(next.threshold) - gross)}` : (achieved ? ' · 최고 혜택 달성' : '')}
        </div>
      </div>
    );
  };

  const [yy, mm] = month.split('-');
  const label = `${yy} 년 ${Number(mm)} 월`;

  const summaryBtn = (active, color) => ({
    flex: 1, border: 'none', padding: '2px 0', cursor: 'pointer',
    borderRadius: 12, transition: 'background 0.15s ease',
    background: active ? `${color}1c` : 'transparent',
  });

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="통계" showBack={false} />

      {/* 월 이동 */}
      <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))} style={roundBtn(32)}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#191722', letterSpacing: '-.2px' }}>{label}</span>
        <button aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))} style={roundBtn(32)}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      </div>

      {/* 요약 카드 + 고양이/말풍선(분류별·원천별 전환) */}
      <div style={{ position: 'relative', marginTop: 8 }}>
        <div style={{ position: 'absolute', right: 8, bottom: '100%', marginBottom: 0, display: 'flex', alignItems: 'flex-end', gap: 3, zIndex: 3 }}>
          <button aria-label="통계 유형 전환" onClick={() => setStatView((v) => (v === 'category' ? 'source' : 'category'))}
            style={{ position: 'relative', width: 34, height: 26, borderRadius: 12, border: 'none', background: '#eceae7', color: '#4a4640', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flex: 'none', marginBottom: 12 }}>
            <svg width="8" height="7.5" viewBox="0 0 8 7.5" style={{ position: 'absolute', right: 3, bottom: -4.5, pointerEvents: 'none' }} aria-hidden="true"><path d="M1.1 0 Q-0.8 5.3 7.9 6.8 Q4.7 4.7 4.2 0 Z" fill="#eceae7" /></svg>
            {statView === 'category' ? (
              <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" /><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1h-4a2 2 0 1 0 0 4" /></svg>
            ) : (
              <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.57 3H4a1 1 0 0 0-1 1v5.57a2 2 0 0 0 .83 1.42l9.58 9.58a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.83z" /><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" /></svg>
            )}
          </button>
          <CatMascot width={70} />
        </div>
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 6px 20px rgba(25,23,34,.07)', display: 'flex', alignItems: 'center', textAlign: 'center' }}>
          <button type="button" onClick={() => setTab('income')} style={summaryBtn(tab === 'income', '#2CDDB9')}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>수입</div>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#2CDDB9' }}>{fmtNum(totals.income)}</div>
          </button>
          <div style={{ width: 1, height: 30, background: '#efeef2' }} />
          <button type="button" onClick={() => setTab('expense')} style={summaryBtn(tab === 'expense', '#FF4358')}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>지출</div>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#FF4358' }}>{fmtNum(totals.expense)}</div>
          </button>
          <div style={{ width: 1, height: 30, background: '#efeef2' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>합계</div>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#191722' }}>{fmtNum(totals.balance)}</div>
          </div>
        </div>
      </div>

      {statView === 'category' ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>분류별 {tab === 'expense' ? '지출' : '수입'}</h3>
          {byCat.length === 0 ? <div className="empty">해당 월 데이터가 없습니다.</div> : (
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
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>원천별 {tab === 'expense' ? '지출' : '수입'}</h3>
          {bySrc.length === 0 ? <div className="empty">해당 월 데이터가 없습니다.</div> : (
            <div className="legend-list">
              {bySrc.map((s, i) => (
                <div key={s.source_id != null ? `id${s.source_id}` : `nm${s.name}`}>
                  <div className="legend-row">
                    <span className="sw" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="lname">{s.name}</span>
                    <span className="muted small">{totalSrc ? Math.round((s.total / totalSrc) * 100) : 0}%</span>
                    <span className="lval">{fmtWon(s.total)}</span>
                  </div>
                  {tab === 'expense' && s.source_id != null && cardProgress(s.source_id)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
