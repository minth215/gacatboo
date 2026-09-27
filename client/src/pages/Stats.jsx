import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import {
  fmtNum, fmtWon, currentMonth, currentYear, today, dotDate,
  weekStartOf, periodBounds, periodLabel, shiftPeriod, periodTickLabel,
} from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import CatMascot from '../components/CatMascot.jsx';
import Spinner from '../components/Spinner.jsx';
import TransactionList from '../components/TransactionList.jsx';

// 도넛/표에서 쓰는 파스텔 팔레트(시안)
const PALETTE = ['#FF6F91', '#F0A13D', '#5B9BD8', '#8B7FE8', '#2CDDB9', '#FDE2E2', '#FFB4A2', '#9AD0C2', '#C6A8E8', '#7FB3D5'];
const PERIOD_LABELS = { week: '주별', month: '월별', year: '연별', range: '기간' };
const CHART_POINTS = 6; // 상세 꺾은선 그래프에 표시할 기간 수

const roundBtn = {
  width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#fff',
  boxShadow: '0 3px 12px rgba(25,23,34,.1)', cursor: 'pointer', color: '#8b8798',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none',
};
const arrow = (points) => (
  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points={points} /></svg>
);
const sortArrow = (asc) => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    {asc
      ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>
      : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="5 12 12 19 19 12" /></>}
  </svg>
);

// 행을 분류별/원천별/항목별 키·이름으로 변환
const keyOf = (r, view) => {
  if (view === 'category') return { key: `c:${r.category_name || '미분류'}`, name: r.category_name || '미분류' };
  if (view === 'source') {
    const name = r.source_name || '미지정';
    return { key: r.source_id != null ? `s:${r.source_id}` : `sn:${name}`, name };
  }
  const name = (r.content || '').trim() || r.category_name || '미분류';
  return { key: `i:${name}`, name };
};

export default function Stats() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [periodMode, setPeriodMode] = useState('month'); // week | month | year | range
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [week, setWeek] = useState(() => weekStartOf(today()));
  const [year, setYear] = useState(currentYear());
  const [range, setRange] = useState(() => ({ from: today(), to: today() }));

  const [tab, setTab] = useState('expense'); // expense | income
  const [statView, setStatView] = useState('category'); // category | source | item
  const [chartMode, setChartMode] = useState('donut'); // donut | table
  const [sort, setSort] = useState({ key: 'amount', dir: 'desc' });
  const [hoverIdx, setHoverIdx] = useState(null);
  const [detail, setDetail] = useState(null); // { key, name, color, view, sourceId }

  const [rows, setRows] = useState([]);
  const [chartRows, setChartRows] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);

  const anchor = periodMode === 'week' ? week : periodMode === 'year' ? year : periodMode === 'range' ? range : month;
  const { start, endExclusive } = periodBounds(periodMode, anchor);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    db.statsRows({ start, endExclusive })
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { console.error(e); if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [start, endExclusive]);
  useEffect(() => { db.listCardBenefits().then(setTiers).catch(() => setTiers([])); }, []);

  const movePeriod = (delta) => {
    if (periodMode === 'week') setWeek((w) => shiftPeriod('week', w, delta));
    else if (periodMode === 'year') setYear((y) => shiftPeriod('year', y, delta));
    else if (periodMode === 'month') setMonth((m) => shiftPeriod('month', m, delta));
  };

  // ---------- 집계 ----------
  const groups = useMemo(() => {
    const map = new Map();
    rows.filter((r) => r.type === tab && r.eff > 0).forEach((r) => {
      const { key, name } = keyOf(r, statView);
      const cur = map.get(key) || { key, name, total: 0, count: 0, sourceId: r.source_id ?? null };
      cur.total += r.eff;
      cur.count += 1;
      map.set(key, cur);
    });
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .map((g, i) => ({ ...g, color: PALETTE[i % PALETTE.length] }));
  }, [rows, tab, statView]);

  const total = groups.reduce((s, g) => s + g.total, 0);

  // 카드 실적(원천별·지출에서만): 정산 차감 없는 원금 기준
  const tiersBySource = useMemo(() => {
    const m = {};
    tiers.forEach((t) => { (m[t.source_id] ||= []).push(t); });
    Object.values(m).forEach((arr) => arr.sort((a, b) => a.threshold - b.threshold));
    return m;
  }, [tiers]);
  const grossBySource = useMemo(() => {
    const m = {};
    rows.filter((r) => r.type === 'expense' && r.source_id != null)
      .forEach((r) => { m[r.source_id] = (m[r.source_id] || 0) + Number(r.amount); });
    return m;
  }, [rows]);
  const tierOf = (sourceId) => {
    if (statView !== 'source' || tab !== 'expense' || sourceId == null) return null;
    const arr = tiersBySource[sourceId];
    if (!arr || !arr.length) return null;
    const gross = grossBySource[sourceId] || 0;
    const achieved = [...arr].filter((t) => gross >= Number(t.threshold)).pop();
    const next = arr.find((t) => gross < Number(t.threshold));
    const goal = Number((next || achieved).threshold);
    return { goal, percent: Math.min(100, Math.round((gross / goal) * 100)), achieved, next };
  };

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...groups].sort((a, b) => (sort.key === 'name'
      ? a.name.localeCompare(b.name) * dir
      : (a[sort.key === 'count' ? 'count' : 'total'] - b[sort.key === 'count' ? 'count' : 'total']) * dir));
  }, [groups, sort]);

  // 도넛 conic-gradient + 각 조각의 각도(터치 위치로 조각 찾기용)
  const { gradient, arcs } = useMemo(() => {
    if (!total) return { gradient: '#f2f1f5', arcs: [] };
    let cum = 0;
    const stops = [];
    const list = groups.map((g) => {
      const from = (cum / total) * 360;
      cum += g.total;
      const to = (cum / total) * 360;
      stops.push(`${g.color} ${from / 3.6}% ${to / 3.6}%`);
      return { ...g, from, to };
    });
    return { gradient: `conic-gradient(${stops.join(',')})`, arcs: list };
  }, [groups, total]);

  const donutPoint = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = e.touches && e.touches[0] ? e.touches[0] : e;
    const dx = pt.clientX - (rect.left + rect.width / 2);
    const dy = pt.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > rect.width / 2 || dist < rect.width / 2 * 0.22) return setHoverIdx(null);
    const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const idx = arcs.findIndex((a) => deg >= a.from && deg < a.to);
    setHoverIdx(idx >= 0 ? idx : null);
  };
  const hover = hoverIdx != null ? arcs[hoverIdx] : null;

  // ---------- 상세 ----------
  const matchesDetail = (r, d) => {
    if (d.view === 'category') return (r.category_name || '미분류') === d.name;
    if (d.view === 'source') return d.sourceId != null ? r.source_id === d.sourceId : (r.source_name || '미지정') === d.name;
    return ((r.content || '').trim() || r.category_name || '미분류') === d.name;
  };

  // 상세 꺾은선: 같은 단위의 최근 CHART_POINTS 기간(기간 선택 모드는 월 단위로)
  const chartMeta = useMemo(() => {
    if (!detail) return null;
    const unit = periodMode === 'range' ? 'month' : periodMode;
    const last = periodMode === 'range' ? range.to.slice(0, 7) : anchor;
    const anchors = [];
    for (let i = CHART_POINTS - 1; i >= 0; i--) anchors.push(shiftPeriod(unit, last, -i));
    return {
      unit,
      anchors,
      start: periodBounds(unit, anchors[0]).start,
      endExclusive: periodBounds(unit, anchors[anchors.length - 1]).endExclusive,
    };
  }, [detail, periodMode, anchor, range.to]);

  useEffect(() => {
    if (!chartMeta) { setChartRows([]); return; }
    let alive = true;
    db.statsRows({ start: chartMeta.start, endExclusive: chartMeta.endExclusive })
      .then((r) => { if (alive) setChartRows(r); })
      .catch(() => { if (alive) setChartRows([]); });
    return () => { alive = false; };
  }, [chartMeta?.start, chartMeta?.endExclusive]);

  const chartPoints = useMemo(() => {
    if (!detail || !chartMeta) return [];
    const mine = chartRows.filter((r) => r.type === tab && r.eff > 0 && matchesDetail(r, detail));
    return chartMeta.anchors.map((a) => {
      const b = periodBounds(chartMeta.unit, a);
      const amount = mine.filter((r) => r.date >= b.start && r.date < b.endExclusive).reduce((s, r) => s + r.eff, 0);
      return { label: periodTickLabel(chartMeta.unit, a), amount, active: a === chartMeta.anchors[chartMeta.anchors.length - 1] };
    });
  }, [detail, chartMeta, chartRows, tab]);

  const detailTxs = useMemo(
    () => (detail ? rows.filter((r) => r.type === tab && r.eff > 0 && matchesDetail(r, detail)) : []),
    [detail, rows, tab],
  );

  // ---------- 화면 ----------
  const periodBar = (
    <div style={{ marginTop: 14 }}>
      {periodMode === 'range' ? (
        <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 6 }}>
          <DateField value={range.from} align="flex-end" onChange={(v) => setRange((r) => ({ ...r, from: v, to: v > r.to ? v : r.to }))} />
          <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>~</span>
          <DateField value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v, from: v < r.from ? v : r.from }))} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button aria-label="이전" onClick={() => movePeriod(-1)} style={roundBtn}>{arrow('15 6 9 12 15 18')}</button>
          <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722', letterSpacing: '-.2px', minWidth: periodMode === 'week' ? 0 : 88, textAlign: 'center', whiteSpace: 'nowrap' }}>
            {periodLabel(periodMode, anchor)}
          </span>
          <button aria-label="다음" onClick={() => movePeriod(1)} style={roundBtn}>{arrow('9 6 15 12 9 18')}</button>
        </div>
      )}
    </div>
  );

  if (detail) {
    return (
      <div style={{ padding: '44px 0 12px' }}>
        <PageHeader title={detail.name} flat onBack={() => setDetail(null)} />
        {periodBar}

        <div style={{ marginTop: 22, background: '#fff', borderRadius: 20, padding: '16px 16px 34px', boxShadow: '0 6px 20px rgba(25,23,34,.07)' }}>
          <LineChart points={chartPoints} color={detail.color} />
        </div>

        <div style={{ marginTop: 4 }}>
          <TransactionList
            transactions={detailTxs}
            canEdit={() => true}
            onEdit={(t) => nav(`/tx/${t.id}`)}
            groupByMonth={periodMode === 'year' || periodMode === 'range'}
            emptyText="해당 기간 내역이 없습니다."
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="통계" showBack={false} right={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          {[['category', '분류별'], ['source', '원천별'], ['item', '항목별']].map(([v, label]) => (
            <button key={v} onClick={() => setStatView(v)} style={{
              border: 'none', backgroundColor: 'transparent', padding: '0 1px', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 500, letterSpacing: '-.2px',
              color: statView === v ? '#191722' : '#a29ead',
              backgroundImage: statView === v ? 'linear-gradient(180deg, transparent 56%, #FFD9A0 56%)' : 'none',
              backgroundRepeat: 'no-repeat',
            }}>{label}</button>
          ))}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setPeriodMenuOpen((o) => !o)} style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#fff',
              boxShadow: '0 3px 12px rgba(25,23,34,.1)', color: '#6c6779', fontFamily: 'inherit',
              fontSize: 10.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', padding: 0,
            }}>{PERIOD_LABELS[periodMode]}</button>
            {periodMenuOpen && (
              <>
                <div onClick={() => setPeriodMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                <div style={{
                  position: 'absolute', top: 44, right: 0, background: '#fff', borderRadius: 14,
                  boxShadow: '0 10px 30px rgba(25,23,34,.15)', padding: 5, display: 'flex', flexDirection: 'column',
                  gap: 1, zIndex: 20, minWidth: 82,
                }}>
                  {Object.entries({ week: '주별', month: '월별', year: '연별', range: '기간 선택' }).map(([m, label]) => (
                    <button key={m} onClick={() => { setPeriodMode(m); setPeriodMenuOpen(false); }} style={{
                      border: 'none', borderRadius: 9, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                      padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
                      background: periodMode === m ? '#fff1e6' : 'transparent',
                      color: periodMode === m ? '#FF3B5C' : '#4a4640',
                    }}>{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )} />

      {periodBar}

      {/* 고양이 말풍선: 원형 그래프 ↔ 표 전환 */}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 8, paddingRight: 20, position: 'relative', zIndex: 3 }}>
        <button aria-label="뷰 전환" onClick={() => setChartMode((m) => (m === 'donut' ? 'table' : 'donut'))} style={{
          position: 'relative', width: 34, height: 26, borderRadius: 12, border: 'none', background: '#eceae7',
          color: '#4a4640', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          padding: 0, flex: 'none', marginBottom: 16,
        }}>
          <svg width="8" height="7.5" viewBox="0 0 8 7.5" style={{ position: 'absolute', right: 3, bottom: -4.5, pointerEvents: 'none' }} aria-hidden="true"><path d="M1.1 0 Q-0.8 5.3 7.9 6.8 Q4.7 4.7 4.2 0 Z" fill="#eceae7" /></svg>
          {chartMode === 'donut' ? (
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
          ) : (
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
          )}
        </button>
        <CatMascot width={70} style={{ display: 'block' }} />
      </div>

      {/* 수입/지출 */}
      <div style={{ display: 'flex', background: '#f4f2f0', borderRadius: 999, padding: 4 }}>
        {[['income', '수입'], ['expense', '지출']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, border: 'none', borderRadius: 999, padding: '11px 0', fontFamily: 'inherit',
            fontSize: 13.25, fontWeight: 700, cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#191722' : '#8b8798',
          }}>{label}</button>
        ))}
      </div>

      {loading && !rows.length ? <Spinner /> : groups.length === 0 ? (
        <div className="empty">해당 기간 데이터가 없습니다.</div>
      ) : chartMode === 'donut' ? (
        <>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', position: 'relative' }}>
            {hover && (
              <div style={{
                position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', background: '#191722',
                color: '#fff', borderRadius: 10, padding: '7px 12px', fontSize: 11, fontWeight: 600,
                whiteSpace: 'nowrap', zIndex: 8, boxShadow: '0 6px 16px rgba(25,23,34,.25)',
              }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: hover.color, marginRight: 6 }} />
                {hover.name} · {fmtNum(hover.total)} · {Math.round((hover.total / total) * 100)}%
              </div>
            )}
            <div
              onMouseMove={donutPoint} onMouseLeave={() => setHoverIdx(null)}
              onTouchStart={donutPoint} onTouchMove={donutPoint} onTouchEnd={() => setHoverIdx(null)}
              style={{ position: 'relative', width: 180, height: 180, borderRadius: '50%', background: gradient, marginTop: 34, touchAction: 'none' }}
            >
              <div style={{
                position: 'absolute', inset: 20, borderRadius: '50%', background: 'var(--bg)', display: 'flex',
                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#a29ead' }}>{tab === 'expense' ? '총 지출' : '총 수입'}</span>
                <span style={{ marginTop: 3, fontSize: 16.5, fontWeight: 800, color: '#191722' }}>{fmtNum(total)}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((g) => {
              const tier = tierOf(g.sourceId);
              return (
                <div key={g.key} onClick={() => setDetail({ ...g, view: statView })} style={{
                  background: '#fff', borderRadius: 16, padding: '12px 14px',
                  boxShadow: '0 4px 16px rgba(25,23,34,.05)', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: g.color, flex: 'none' }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#191722', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#a29ead' }}>{total ? Math.round((g.total / total) * 100) : 0}%</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#191722', minWidth: 64, textAlign: 'right' }}>{fmtNum(g.total)}</span>
                  </div>
                  {tier && (
                    <div style={{ marginTop: 9 }}>
                      <div style={{ height: 6, borderRadius: 999, background: '#f2f1f5', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, background: g.color, width: `${tier.percent}%` }} />
                      </div>
                      <div style={{ marginTop: 5, fontSize: 10.25, color: '#8b8798' }}>
                        실적 {fmtWon(tier.goal)} 목표 · {tier.percent}% 달성
                        {tier.achieved ? ` · ✅ ${tier.achieved.benefit || '혜택'}` : ''}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 22, background: '#fff', borderRadius: 16, boxShadow: '0 4px 16px rgba(25,23,34,.05)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f2f1f5' }}>
            {[['name', '내용', { flex: 1 }], ['count', '건수', { width: 52 }], ['amount', '금액', { minWidth: 84 }]].map(([key, label, style]) => (
              <button key={key} onClick={() => setSort((s) => ({
                key,
                dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : (key === 'name' ? 'asc' : 'desc'),
              }))} style={{
                ...style, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                fontSize: 11.5, fontWeight: 700, color: sort.key === key ? '#FF3B5C' : '#a29ead',
              }}>
                {label}
                {sort.key === key && sortArrow(sort.dir === 'asc')}
              </button>
            ))}
          </div>
          {sorted.map((g, i) => (
            <div key={g.key} onClick={() => setDetail({ ...g, view: statView })} style={{
              display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer',
              borderBottom: i === sorted.length - 1 ? 'none' : '1px solid #f7f6f4',
            }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flex: 'none' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#191722', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
              </div>
              <span style={{ width: 52, textAlign: 'right', fontSize: 12.5, color: '#8b8798' }}>{fmtNum(g.count)}</span>
              <span style={{ minWidth: 84, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#191722' }}>{fmtNum(g.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 기간 선택 모드의 날짜 입력: 값은 직접 그리고 네이티브 입력은 숨김(기기별 글자 크기 문제 회피)
function DateField({ value, onChange, align = 'flex-start' }) {
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  return (
    <div style={{ position: 'relative', display: 'inline-flex', width: 82, justifyContent: align }}>
      <span onClick={open} style={{ fontSize: 13.25, fontWeight: 700, color: '#191722', letterSpacing: '-.2px', cursor: 'pointer' }}>{dotDate(value)}</span>
      <input
        type="date" ref={ref} value={value} onChange={(e) => e.target.value && onChange(e.target.value)}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, border: 'none', padding: 0, margin: 0, pointerEvents: 'none' }}
      />
    </div>
  );
}

// 상세 꺾은선 그래프
function LineChart({ points, color }) {
  if (!points.length) return null;
  const W = 280, H = 110, padX = 18, plotTop = 26, plotH = 52;
  const amounts = points.map((p) => p.amount);
  const max = Math.max(...amounts), min = Math.min(...amounts);
  const span = Math.max(1, max - min);
  const xs = points.map((_, i) => (points.length === 1 ? W / 2 : padX + i * ((W - padX * 2) / (points.length - 1))));
  const ys = points.map((p) => plotTop + (1 - (p.amount - min) / span) * plotH);

  return (
    <div style={{ position: 'relative', width: '100%', height: H }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <line x1="2" y1="104" x2={W - 2} y2="104" stroke="#e5e3df" strokeWidth="1" />
        <polyline
          points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
          fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle key={p.label} cx={xs[i]} cy={ys[i]} r={p.active ? 5.5 : 4}
            fill={p.active ? '#fff' : color} stroke={p.active ? color : '#fff'} strokeWidth={p.active ? 2.5 : 1.5} />
        ))}
      </svg>
      {points.map((p, i) => (
        <div key={p.label}>
          <div style={{
            position: 'absolute', top: `${(ys[i] / H) * 100}%`, left: `${(xs[i] / W) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 8px))', fontSize: 8,
            fontWeight: p.active ? 700 : 500, color: p.active ? color : '#6c6779', whiteSpace: 'nowrap',
          }}>{fmtNum(p.amount)}</div>
          <div style={{
            position: 'absolute', top: '100%', left: `${(xs[i] / W) * 100}%`, marginTop: 6,
            transform: 'translateX(-50%)', fontSize: 9.5,
            fontWeight: p.active ? 700 : 600, color: p.active ? '#191722' : '#a29ead', whiteSpace: 'nowrap',
          }}>{p.label}</div>
        </div>
      ))}
    </div>
  );
}
