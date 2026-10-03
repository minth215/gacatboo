import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import {
  fmtNum, fmtWon, currentMonth, currentYear, today, dotDate, shiftDate,
  weekStartOf, periodBounds, periodLabel, shiftPeriod, periodTickLabel,
} from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import CatMascot from '../components/CatMascot.jsx';
import Spinner from '../components/Spinner.jsx';
import TransactionList from '../components/TransactionList.jsx';

// 도넛/표에서 쓰는 파스텔 팔레트(시안)
const PALETTE = ['#FF6F91', '#F0A13D', '#5B9BD8', '#8B7FE8', '#2CDDB9', '#FDE2E2', '#FFB4A2', '#9AD0C2', '#C6A8E8', '#7FB3D5', '#FFC94D', '#6FCF7C', '#E68FC0'];
const PERIOD_LABELS = { week: '주별', month: '월별', year: '연별', range: '기간' };
// 상세 꺾은선 그래프: 한 번에 보이는 기간 수와, 좌우 스와이프로 더 볼 수 있는 여유 기간
const CHART_VISIBLE = 6;
const CHART_BACK = 17;
const CHART_FWD = 4;

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
// 구독/정산 그룹의 입금은 총무·총대 가계부에 "{내용} - {닉네임}" 형태로 기록된다.
// 항목별 집계에서는 닉네임을 빼고 내용만으로 묶는다(상세 목록에서는 r.content 원본을
// 그대로 보여주므로 닉네임이 계속 표시된다).
const itemNameOf = (r) => {
  const content = (r.content || '').trim();
  if (r.origin_type !== 'deposit') return content;
  const idx = content.lastIndexOf(' - ');
  return (idx === -1 ? content : content.slice(0, idx)).trim();
};

// 원형(도넛) 그래프 조각 경로. 0°=12시, 시계 방향. cx/cy 중심, R 바깥·r 안쪽 반지름.
const DONUT = { size: 180, R: 90, r: 70 };
const polar = (rad, deg) => {
  const a = (deg * Math.PI) / 180;
  return [DONUT.size / 2 + rad * Math.sin(a), DONUT.size / 2 - rad * Math.cos(a)];
};
const donutSlicePath = (from, to) => {
  const { R, r } = DONUT;
  if (to - from >= 359.99) {
    // 조각이 하나뿐이면 시작=끝이라 호를 못 그리므로 반원 두 개로 고리를 만든다.
    const [ox, oy] = polar(R, 0), [ox2, oy2] = polar(R, 180);
    const [ix, iy] = polar(r, 0), [ix2, iy2] = polar(r, 180);
    return `M${ox},${oy} A${R},${R} 0 1 1 ${ox2},${oy2} A${R},${R} 0 1 1 ${ox},${oy} Z `
      + `M${ix},${iy} A${r},${r} 0 1 0 ${ix2},${iy2} A${r},${r} 0 1 0 ${ix},${iy} Z`;
  }
  const large = to - from > 180 ? 1 : 0;
  const [x0, y0] = polar(R, from), [x1, y1] = polar(R, to);
  const [x2, y2] = polar(r, to), [x3, y3] = polar(r, from);
  return `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`;
};

const keyOf = (r, view) => {
  if (view === 'category') return { key: `c:${r.category_name || '미분류'}`, name: r.category_name || '미분류' };
  if (view === 'source') {
    const name = r.source_name || '미지정';
    return { key: r.source_id != null ? `s:${r.source_id}` : `sn:${name}`, name };
  }
  const name = itemNameOf(r) || r.category_name || '미분류';
  return { key: `i:${name}`, name };
};

// 통계에 반영할 금액. 보기(뷰)에 따라 기준이 다르다.
// - 분류별: 정산을 상계한 실질 금액(eff). 지출은 정산 수입으로 메워진 만큼을 빼고,
//   정산 수입은 지출을 넘어선 초과분만 잡아서 "정산" 분류가 실제 손익만 나타내도록 한다.
// - 원천별·항목별: 정산 상계 없이 실제로 오간 원금 그대로. 어느 카드로 얼마를 긁었는지,
//   어느 통장에 얼마가 들어왔는지를 봐야 하므로 정산으로 주고받은 금액을 빼지 않는다.
// settleReflect: 분류별 보기에서 "정산 반영" 토글 상태. On 이면 정산 상계 반영(eff),
// Off 면 원천별·항목별과 같은 원금(amount) 기준으로 집계한다.
const statAmount = (r, view, settleReflect = true) => (view === 'category' && settleReflect ? r.eff : Number(r.amount));

export default function Stats() {
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  // 항목 카드를 눌러 기록 수정 페이지로 갔다가 돌아온 경우, 그 순간의 화면 상태를 복원한다.
  // location.state 는 이 화면이 처음 마운트될 때 한 번만 읽으면 되므로 ref 에 담아 둔다
  // (마운트 이후 목록 화면으로 정상 진입한 경우와 구분하기 위해, 복원 후에는 비워 둔다).
  const restoreRef = useRef(location.state?.statsRestore ?? null);

  const [periodMode, setPeriodMode] = useState(() => restoreRef.current?.periodMode ?? 'month'); // week | month | year | range
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [month, setMonth] = useState(() => restoreRef.current?.month ?? currentMonth());
  const [week, setWeek] = useState(() => restoreRef.current?.week ?? weekStartOf(today()));
  const [year, setYear] = useState(() => restoreRef.current?.year ?? currentYear());
  const [range, setRange] = useState(() => restoreRef.current?.range ?? { from: shiftDate(today(), -6), to: today() });

  const [tab, setTab] = useState(() => restoreRef.current?.tab ?? 'expense'); // expense | income
  const [statView, setStatView] = useState(() => restoreRef.current?.statView ?? 'category'); // category | source | item
  // 분류별 보기에서만 쓰는 "정산 반영" 토글. On(기본)이면 정산 상계 반영, Off 면 원천별·항목별처럼 원금 그대로.
  const [settleReflect, setSettleReflect] = useState(true);
  const [chartMode, setChartMode] = useState('donut'); // donut | table
  const [sort, setSort] = useState({ key: 'amount', dir: 'desc' });
  const [hoverIdx, setHoverIdx] = useState(null);
  const [hoverPos, setHoverPos] = useState(null); // 툴팁을 띄울 위치(원형 그래프 기준 좌표)
  const donutRef = useRef(null);
  const [detail, setDetail] = useState(() => restoreRef.current?.detail ?? null); // { key, name, color, view, sourceId }
  const [viewOffset, setViewOffset] = useState(() => restoreRef.current?.viewOffset ?? 0); // 상세 그래프 좌우 스와이프 이동량(기간 단위)
  // 그래프 점을 눌러 기간을 바꾸면 그래프 구간을 고정해 둔다({ unit, center }). 다른 방법으로 기간이 바뀌면 해제.
  const [chartPin, setChartPin] = useState(() => restoreRef.current?.chartPin ?? null);
  const pickingRef = useRef(false);

  // 복원해서 썼으면, 이후 이 화면에 남아 있는 history state 를 지운다(다시 마운트될 때
  // 엉뚱하게 재사용되지 않도록). 실제 history 항목은 기록 수정 페이지로 넘어가기 직전에
  // 다시 채워 넣는다(아래 openDetailTx).
  useEffect(() => {
    if (restoreRef.current) nav(location.pathname + location.search, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rows, setRows] = useState([]);
  const [chartRows, setChartRows] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  // 상세 뷰에 들어가기 직전 화면 상태(기간·데이터·스크롤). "<"로 돌아오면 그대로 복원한다.
  const detailSnapRef = useRef(null);
  const skipFetchKeyRef = useRef(null);
  const restoreScrollRef = useRef(null);

  const anchor = periodMode === 'week' ? week : periodMode === 'year' ? year : periodMode === 'range' ? range : month;
  const { start, endExclusive } = periodBounds(periodMode, anchor);

  useEffect(() => {
    // 상세 뷰에서 돌아오며 들어가기 전 데이터를 그대로 복원한 경우엔 다시 불러오지 않는다.
    const skip = skipFetchKeyRef.current === `${start}|${endExclusive}`;
    skipFetchKeyRef.current = null;
    if (skip) return;
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
    rows.filter((r) => r.type === tab && statAmount(r, statView, settleReflect) > 0).forEach((r) => {
      const { key, name } = keyOf(r, statView);
      const cur = map.get(key) || { key, name, total: 0, count: 0, sourceId: r.source_id ?? null };
      cur.total += statAmount(r, statView, settleReflect);
      cur.count += 1;
      map.set(key, cur);
    });
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .map((g, i) => ({ ...g, color: PALETTE[i % PALETTE.length] }));
  }, [rows, tab, statView, settleReflect]);

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

  // 도넛 각 조각의 각도(그리기 + 터치 위치로 조각 찾기용)
  const arcs = useMemo(() => {
    if (!total) return [];
    let cum = 0;
    return groups.map((g) => {
      const from = (cum / total) * 360;
      cum += g.total;
      return { ...g, from, to: (cum / total) * 360 };
    });
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
    setHoverPos({ x: pt.clientX - rect.left, y: pt.clientY - rect.top });
  };
  const hover = hoverIdx != null ? arcs[hoverIdx] : null;
  // 툴팁 위치: 누른 지점에서 말풍선 가장자리가 시작되어 그래프 바깥 방향으로 펼쳐지게 한다.
  // (오른쪽을 누르면 오른쪽으로, 위를 누르면 위로, 대각선은 그 사이로 자연스럽게 섞임)
  // 화면 좌우 끝을 넘으면 안쪽으로 당겨 넣는다(이때는 그래프 안쪽을 살짝 덮을 수 있음).
  const tipRef = useRef(null);
  const [tipBox, setTipBox] = useState(null);
  useLayoutEffect(() => {
    if (!hover || !hoverPos || !tipRef.current || !donutRef.current) { setTipBox(null); return; }
    const w = tipRef.current.offsetWidth;
    const h = tipRef.current.offsetHeight;
    const c = DONUT.size / 2;
    const dx = hoverPos.x - c, dy = hoverPos.y - c;
    const len = Math.hypot(dx, dy) || 1;
    const sin = dx / len, cos = -dy / len; // 12시 기준 각도의 sin/cos
    const gap = 6; // 누른 지점에서 바깥쪽으로 살짝 띄움
    const ax = hoverPos.x + gap * sin, ay = hoverPos.y - gap * cos;
    let left = ax - w * (0.5 - 0.5 * sin);
    const top = ay - h * (0.5 + 0.5 * cos);
    const d = donutRef.current.getBoundingClientRect();
    left = Math.max(8 - d.left, Math.min(window.innerWidth - 8 - d.left - w, left));
    setTipBox({ left, top });
  }, [hover, hoverPos]);
  // 데이터·보기가 바뀌면 툴팁을 닫는다(조각 구성이 달라짐).
  useEffect(() => { setHoverIdx(null); }, [statView, tab, start, endExclusive, settleReflect, chartMode]);
  // 터치로 연 툴팁은 손을 떼도 유지하고, 원형 그래프 밖을 누르면 닫는다.
  useEffect(() => {
    if (hoverIdx == null) return undefined;
    const close = (e) => { if (!donutRef.current?.contains(e.target)) setHoverIdx(null); };
    document.addEventListener('touchstart', close);
    return () => document.removeEventListener('touchstart', close);
  }, [hoverIdx]);

  // ---------- 상세 ----------
  const matchesDetail = (r, d) => {
    if (d.view === 'category') return (r.category_name || '미분류') === d.name;
    if (d.view === 'source') return d.sourceId != null ? r.source_id === d.sourceId : (r.source_name || '미지정') === d.name;
    return (itemNameOf(r) || r.category_name || '미분류') === d.name;
  };

  // 상세 꺾은선: 선택 기간과 같은 단위로 앞뒤 여유를 둔 기간 목록(기간 선택 모드는 월 단위로)
  const chartUnit = periodMode === 'range' ? 'month' : periodMode;
  const chartCur = periodMode === 'range' ? range.to.slice(0, 7) : anchor;
  const chartMeta = useMemo(() => {
    if (!detail) return null;
    // 점을 눌러 기간을 옮긴 경우엔 그래프 구간(창)을 그대로 두고 선택 점만 바꾼다.
    const center = chartPin && chartPin.unit === chartUnit ? chartPin.center : chartCur;
    const anchors = [];
    for (let i = -CHART_BACK; i <= CHART_FWD; i++) anchors.push(shiftPeriod(chartUnit, center, i));
    return {
      unit: chartUnit,
      anchors,
      selectedIdx: anchors.indexOf(chartCur),
      start: periodBounds(chartUnit, anchors[0]).start,
      endExclusive: periodBounds(chartUnit, anchors[anchors.length - 1]).endExclusive,
    };
  }, [detail, chartUnit, chartCur, chartPin]);

  // 기간이 바뀌면 그래프 스크롤 위치를 선택 기간 기준으로 되돌림
  // (range 모드의 anchor 는 객체라 매 렌더 새로 만들어지므로 문자열 경계값을 의존성으로 씀).
  // 단 그래프의 점을 눌러 바뀐 경우엔 그래프를 움직이지 않는다(구간·스크롤 위치 유지).
  useEffect(() => {
    if (pickingRef.current) { pickingRef.current = false; return; }
    setChartPin(null);
    setViewOffset(0);
  }, [detail?.key, periodMode, start, endExclusive]);

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
    const mine = chartRows.filter((r) => r.type === tab && statAmount(r, detail.view, settleReflect) > 0 && matchesDetail(r, detail));
    return chartMeta.anchors.map((a, i) => {
      const b = periodBounds(chartMeta.unit, a);
      const amount = mine.filter((r) => r.date >= b.start && r.date < b.endExclusive)
        .reduce((s, r) => s + statAmount(r, detail.view, settleReflect), 0);
      return { anchor: a, label: periodTickLabel(chartMeta.unit, a), amount, active: i === chartMeta.selectedIdx };
    });
  }, [detail, chartMeta, chartRows, tab, settleReflect]);

  // 그래프에서 점을 눌렀을 때 그 기간으로 이동. 그래프는 움직이지 않고 선택 점만 바뀐다.
  const pickPeriod = (unit, a) => {
    pickingRef.current = true;
    setChartPin((pin) => pin || { unit, center: chartCur });
    if (periodMode === 'range') {
      const b = periodBounds('month', a);
      setRange({ from: b.start, to: shiftDate(b.endExclusive, -1) });
    } else if (unit === 'week') setWeek(a);
    else if (unit === 'year') setYear(a);
    else setMonth(a);
  };

  const detailTxs = useMemo(
    () => (detail ? rows.filter((r) => r.type === tab && statAmount(r, detail.view, settleReflect) > 0 && matchesDetail(r, detail)) : []),
    [detail, rows, tab, settleReflect],
  );

  // 상세 뷰의 항목 카드를 눌러 기록 수정 페이지로 이동. 그룹 결제/입금 건은 가계부와
  // 동일하게 해당 그룹의 수정 화면으로 보낸다. 지금 화면 상태를 현재 history 항목에
  // 실어 두고 이동해서, "<"나 저장으로 뒤로 돌아오면(nav(-1)) 그대로 복원되게 한다.
  const canEditTx = (t) => (t.origin_type ? true : t.created_by === user.id);
  const openDetailTx = (t) => {
    nav(location.pathname + location.search, {
      replace: true,
      state: { statsRestore: { periodMode, month, week, year, range, tab, statView, detail, viewOffset, chartPin } },
    });
    if (t.origin_type === 'payment') nav(`/tx/${t.origin_id}?group=${t.origin_group_id}&kind=payment`);
    else if (t.origin_type === 'deposit') nav(`/tx/${t.origin_id}?group=${t.origin_group_id}&kind=deposit`);
    else if (t.origin_type) nav(`/groups/${t.origin_group_id}?edit=${t.origin_type}:${t.origin_id}`);
    else nav(`/tx/${t.id}`);
  };

  // 상세 뷰 진입/복귀. 상세 뷰에서 기간을 옮겨도, 돌아오면 들어가기 전 화면 그대로 보이게 한다.
  const openDetail = (g) => {
    detailSnapRef.current = { periodMode, month, week, year, range, rows, scrollY: window.scrollY };
    setPeriodMenuOpen(false);
    setDetail({ ...g, view: statView });
  };
  const closeDetail = () => {
    const snap = detailSnapRef.current;
    detailSnapRef.current = null;
    setPeriodMenuOpen(false);
    if (snap) {
      const snapAnchor = snap.periodMode === 'week' ? snap.week : snap.periodMode === 'year' ? snap.year
        : snap.periodMode === 'range' ? snap.range : snap.month;
      const b = periodBounds(snap.periodMode, snapAnchor);
      const snapKey = `${b.start}|${b.endExclusive}`;
      // 기간이 실제로 바뀌었을 때만 재조회 건너뛰기를 걸어 둔다(안 바뀌었으면 조회 effect 자체가 안 돈다).
      if (snapKey !== `${start}|${endExclusive}`) skipFetchKeyRef.current = snapKey;
      setPeriodMode(snap.periodMode); setMonth(snap.month); setWeek(snap.week); setYear(snap.year); setRange(snap.range);
      setRows(snap.rows); setLoading(false);
      restoreScrollRef.current = snap.scrollY;
    }
    setDetail(null);
  };
  useEffect(() => {
    if (detail || restoreScrollRef.current == null) return;
    const y = restoreScrollRef.current;
    restoreScrollRef.current = null;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [detail]);

  // ---------- 화면 ----------
  const periodBar = (
    <div style={{ marginTop: 3 }}>
      {periodMode === 'range' ? (
        <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 7 }}>
          <DateField value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v, to: v > r.to ? v : r.to }))} />
          <span style={{ fontSize: 13.25, fontWeight: 700, color: '#6c6779' }}>~</span>
          <DateField value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v, from: v < r.from ? v : r.from }))} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button aria-label="이전" onClick={() => movePeriod(-1)} style={roundBtn}>{arrow('15 6 9 12 15 18')}</button>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: periodMode === 'week' ? 0 : 88 }}>
            <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722', letterSpacing: '-.2px', whiteSpace: 'nowrap' }}>
              {periodLabel(periodMode, anchor)}
            </span>
            {periodMode === 'month' && (
              <input
                type="month" value={month} aria-label="연월 선택" className="catmodal-date-input"
                onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
              />
            )}
            {periodMode === 'year' && (
              <input
                type="number" inputMode="numeric" value={year} aria-label="연도 선택" className="catmodal-date-input"
                min={2000} max={2099}
                onChange={(e) => { if (/^\d{4}$/.test(e.target.value)) setYear(e.target.value); }}
              />
            )}
          </div>
          <button aria-label="다음" onClick={() => movePeriod(1)} style={roundBtn}>{arrow('9 6 15 12 9 18')}</button>
        </div>
      )}
    </div>
  );

  // 상단바 우측 기간 기준(주별/월별/연별/기간 선택) 원형 버튼. 목록과 상세 뷰가 함께 쓴다.
  // 상세 뷰에서 바꾼 기준은 "<"로 돌아올 때 들어가기 전 상태로 되돌아간다(closeDetail).
  const periodModeControl = (
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
  );

  // 그래프에서 보이는 구간의 왼쪽 인덱스. 선택 기간이 보이는 6개 점 중 네 번째에 오도록
  // (선택 기간 오른쪽에 다음 기간 두 개가 보임). 오른쪽 여유 기간은 CHART_FWD 개라 충분하다.
  const CHART_SELECTED_POS = 3; // 0부터 센 위치 → 네 번째 점
  const chartLeftBase = CHART_BACK - CHART_SELECTED_POS;
  const chartLeftIndex = Math.max(0, Math.min(Math.max(0, chartPoints.length - CHART_VISIBLE), chartLeftBase + viewOffset));

  if (detail) {
    return (
      <div style={{ padding: '44px 0 12px' }}>
        <PageHeader title={detail.name} flat onBack={closeDetail} right={periodModeControl} />
        {periodBar}

        <div style={{ marginTop: 10, background: '#fff', borderRadius: 20, padding: '16px 16px 10px', boxShadow: '0 6px 20px rgba(25,23,34,.07)' }}>
          <LineChart
            points={chartPoints} color={detail.color}
            leftIndex={chartLeftIndex} visibleCount={CHART_VISIBLE}
            onScroll={(next) => setViewOffset(next - chartLeftBase)}
            onPick={(i) => { const p = chartPoints[i]; if (p && !p.active) pickPeriod(chartMeta.unit, p.anchor); }}
          />
        </div>

        <div style={{ marginTop: 4 }}>
          <TransactionList
            transactions={detailTxs}
            canEdit={canEditTx}
            onEdit={openDetailTx}
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
              // 형광펜 효과: 선택되면 왼쪽에서 오른쪽으로 칠해지고, 해제되면 왼쪽부터 지워진다.
              // 폭(background-size)만 애니메이션하고 기준 위치는 선택 시 왼쪽/해제 시 오른쪽으로 둔다
              // (위치가 바뀌는 순간은 폭이 0% 또는 100%라 눈에 띄지 않음).
              backgroundImage: 'linear-gradient(180deg, transparent 56%, #FFD9A0 56%)',
              backgroundRepeat: 'no-repeat',
              backgroundSize: statView === v ? '100% 100%' : '0% 100%',
              backgroundPosition: statView === v ? 'left bottom' : 'right bottom',
              transition: 'background-size .35s ease-out, color .2s',
            }}>{label}</button>
          ))}
          {periodModeControl}
        </div>
      )} />

      {periodBar}

      {/* 수입/지출 + 고양이 말풍선(원형 그래프 ↔ 표 전환) — 가계부 요약 카드와 동일한 배치 */}
      <div style={{ position: 'relative', marginTop: 8 }}>
        <div style={{ position: 'absolute', right: 8, bottom: '100%', display: 'flex', alignItems: 'flex-end', gap: 3, zIndex: 3 }}>
          <button aria-label="뷰 전환" onClick={() => setChartMode((m) => (m === 'donut' ? 'table' : 'donut'))} style={{
            position: 'relative', width: 34, height: 26, borderRadius: 12, border: 'none', background: '#eceae7',
            color: '#4a4640', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            padding: 0, flex: 'none', marginBottom: 12,
          }}>
            <svg width="8" height="7.5" viewBox="0 0 8 7.5" style={{ position: 'absolute', right: 3, bottom: -4.5, pointerEvents: 'none' }} aria-hidden="true"><path d="M1.1 0 Q-0.8 5.3 7.9 6.8 Q4.7 4.7 4.2 0 Z" fill="#eceae7" /></svg>
            {chartMode === 'donut' ? (
              <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
            ) : (
              <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
            )}
          </button>
          <CatMascot width={70} />
        </div>
        <div style={{ display: 'flex', background: '#f4f2f0', borderRadius: 999, padding: 4 }}>
          {[['income', '수입'], ['expense', '지출']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, border: 'none', borderRadius: 999, padding: '11px 0', fontFamily: 'inherit',
              fontSize: 13.25, fontWeight: 700, cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#191722' : '#8b8798',
            }}>{label}</button>
          ))}
        </div>

        {/* "정산 반영" 토글은 제 자리를 차지하지 않고 그 아래(원형 그래프 위쪽)에 겹쳐서 뜬다.
            분류별/원천별/항목별 모두 원형 그래프 시작 높이가 같아지도록. */}
        {statView === 'category' && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, zIndex: 3 }}>
            <span style={{ fontSize: 11.5, fontWeight: 400, color: '#8b8798', flex: 'none' }}>정산 반영</span>
            <button
              type="button" role="switch" aria-checked={settleReflect} aria-label="정산 반영"
              className={`ios-toggle${settleReflect ? ' on' : ''}`}
              onClick={() => setSettleReflect((v) => !v)}
              style={{ flex: 'none' }}
            >
              <span className="ios-toggle-knob" />
            </button>
          </div>
        )}
      </div>

      {loading && !rows.length ? <Spinner /> : groups.length === 0 ? (
        // 수입/지출 탭 아래부터 하단 탭 바 바로 위까지의 본문 영역 정중앙
        <div className="empty empty-center" style={{ minHeight: 'calc(100vh - 229px - var(--safe-bottom))' }}>해당 기간 데이터가 없습니다.</div>
      ) : chartMode === 'donut' ? (
        <>
          {/* 원형 그래프 — 위(수입/지출 탭 또는 정산 반영 줄)와의 간격을 아래 카드 목록과 같은 22px 로 */}
          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
            <div
              ref={donutRef}
              onMouseMove={donutPoint} onMouseLeave={() => setHoverIdx(null)}
              onTouchStart={donutPoint} onTouchMove={donutPoint}
              style={{ position: 'relative', width: 180, height: 180, borderRadius: '50%', touchAction: 'none' }}
            >
              {/* 조각별 SVG. 선택된 조각은 바깥쪽으로 살짝 빠져나오며 아주 약간 커지고, 나머지는 흐려진다. */}
              <svg width={DONUT.size} height={DONUT.size} viewBox={`0 0 ${DONUT.size} ${DONUT.size}`}
                style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
                {arcs.map((a, i) => {
                  const active = hoverIdx === i;
                  const mid = ((a.from + a.to) / 2) * Math.PI / 180;
                  const pop = active && a.to - a.from < 359.99 ? 6 : 0;
                  return (
                    <path
                      key={a.key} d={donutSlicePath(a.from, a.to)} fill={a.color} fillRule="evenodd"
                      style={{
                        transformBox: 'view-box', transformOrigin: '50% 50%',
                        transform: active ? `translate(${pop * Math.sin(mid)}px, ${-pop * Math.cos(mid)}px) scale(1.04)` : 'none',
                        opacity: hoverIdx != null && !active ? 0.35 : 1,
                        transition: 'transform .22s ease-out, opacity .22s ease-out',
                      }}
                    />
                  );
                })}
              </svg>
              {/* 툴팁: 누른 지점에서 바깥 방향으로 펼쳐진다(위치는 tipBox) */}
              {hover && hoverPos && (
                <div ref={tipRef} style={{
                  position: 'absolute', left: tipBox?.left ?? 0, top: tipBox?.top ?? 0, visibility: tipBox ? 'visible' : 'hidden',
                  background: '#191722', color: '#fff', borderRadius: 10, padding: '7px 12px', fontSize: 11, fontWeight: 600,
                  whiteSpace: 'nowrap', zIndex: 8, boxShadow: '0 6px 16px rgba(25,23,34,.25)', pointerEvents: 'none',
                }}>
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: hover.color, marginRight: 6 }} />
                  {hover.name} · {fmtNum(hover.total)} · {Math.round((hover.total / total) * 100)}%
                </div>
              )}
              <div style={{
                position: 'absolute', inset: 20, borderRadius: '50%', display: 'flex',
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
                <div key={g.key} onClick={() => openDetail(g)} style={{
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
        <div style={{ marginTop: statView === 'category' ? 34 : 22, background: '#fff', borderRadius: 16, boxShadow: '0 4px 16px rgba(25,23,34,.05)', overflow: 'hidden' }}>
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
            <div key={g.key} onClick={() => openDetail(g)} style={{
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

// 기간 선택 모드의 날짜 입력: 보이는 글자는 직접 그리고, 실제 <input type="date">를 영역 전체에
// 투명하게 덮어 탭만 받게 한다(기기별 글자 크기 문제 회피 + 달력 선택기는 네이티브로 열림).
// 분류/멤버 모달의 .catmodal-date-field 와 동일한 기법.
function DateField({ value, onChange }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', alignSelf: 'stretch', gap: 4 }}>
      <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722', letterSpacing: '-.2px', pointerEvents: 'none' }}>{dotDate(value)}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', pointerEvents: 'none' }}>
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <input
        type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', padding: 0, margin: 0, cursor: 'pointer' }}
      />
    </span>
  );
}

// 상세 꺾은선 그래프. 좌우로 밀면 과거/미래 기간이 스크롤되듯 따라오고, 점을 누르면 그 기간으로 이동.
// viewBox 를 실제 렌더 폭과 1:1 로 맞춰(가로만 늘이지 않음) 점이 타원이 되지 않게 한다.
const CHART_H = 126, CHART_PAD_X = 18, CHART_PLOT_TOP = 26, CHART_AXIS_Y = 100;
// 금액 0 은 X축(CHART_AXIS_Y)에 딱 붙고, 최댓값은 CHART_PLOT_TOP 높이까지 올라간다.
const CHART_PLOT_H = CHART_AXIS_Y - CHART_PLOT_TOP;

function LineChart({ points, color, leftIndex, visibleCount, onScroll, onPick }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef(null);
  const moved = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const step = width ? (width - CHART_PAD_X * 2) / Math.max(1, visibleCount - 1) : 0;
  const maxLeft = Math.max(0, points.length - visibleCount);
  const amounts = points.map((p) => p.amount);
  const max = Math.max(...amounts, 0), min = Math.min(...amounts, 0);
  const span = Math.max(1, max - min);
  const xs = points.map((_, i) => CHART_PAD_X + i * step);
  const ys = points.map((p) => CHART_PLOT_TOP + (1 - (p.amount - min) / span) * CHART_PLOT_H);

  const clampDrag = (px) => Math.max((leftIndex - maxLeft) * step, Math.min(leftIndex * step, px));
  const down = (e) => {
    if (!step) return;
    st.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!st.current) return;
    const dx = e.clientX - st.current.x;
    if (!moved.current) {
      if (Math.abs(e.clientY - st.current.y) > Math.abs(dx) && Math.abs(e.clientY - st.current.y) > 6) { st.current = null; return; }
      if (Math.abs(dx) < 6) return;
      moved.current = true;
      setDragging(true);
    }
    setDragPx(clampDrag(dx));
  };
  const up = (e) => {
    if (!st.current) return;
    const startX = st.current.x;
    st.current = null;
    setDragging(false);
    if (!moved.current) { // 탭: 가장 가까운 점 선택
      const rect = e.currentTarget.getBoundingClientRect();
      const localX = startX - rect.left - dragPx + leftIndex * step;
      let best = 0;
      xs.forEach((x, i) => { if (Math.abs(x - localX) < Math.abs(xs[best] - localX)) best = i; });
      onPick?.(best);
      return;
    }
    onScroll?.(Math.max(0, Math.min(maxLeft, leftIndex - Math.round(dragPx / step))));
    setDragPx(0);
  };

  if (!points.length) return null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: CHART_H, touchAction: 'pan-y', cursor: 'grab' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {width > 0 && (
        <svg width={width} height={CHART_H} viewBox={`0 0 ${width} ${CHART_H}`} style={{ display: 'block', userSelect: 'none' }}>
          <line x1="2" y1={CHART_AXIS_Y} x2={width - 2} y2={CHART_AXIS_Y} stroke="#e5e3df" strokeWidth="1" />
          <g transform={`translate(${-leftIndex * step + dragPx} 0)`} style={{ transition: dragging ? 'none' : 'transform .22s ease-out' }}>
            <polyline
              points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
              fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            />
            {points.map((p, i) => (
              <g key={p.anchor}>
                <circle cx={xs[i]} cy={ys[i]} r={p.active ? 5.5 : 4}
                  fill={p.active ? '#fff' : color} stroke={p.active ? color : '#fff'} strokeWidth={p.active ? 2.5 : 1.5} />
                <text x={xs[i]} y={ys[i] - 11} textAnchor="middle" fontSize="8"
                  fontWeight={p.active ? 700 : 500} fill={p.active ? '#191722' : '#6c6779'}>{fmtNum(p.amount)}</text>
                <text x={xs[i]} y={CHART_AXIS_Y + 17} textAnchor="middle" fontSize="9.5"
                  fontWeight={p.active ? 700 : 600} fill={p.active ? '#191722' : '#a29ead'}>{p.label}</text>
              </g>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
