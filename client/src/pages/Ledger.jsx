import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db, isSettlementIncome } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { currentMonth, shiftMonth, fmtNum, today, shiftDate, weekStartOf, currentYear, periodBounds } from '../lib/format.js';
import TransactionList from '../components/TransactionList.jsx';
import CatMascot from '../components/CatMascot.jsx';
import Spinner from '../components/Spinner.jsx';
import BulkEditModal from '../components/BulkEditModal.jsx';
import { fileToResizedBase64 } from '../components/TransactionForm.jsx';
import LedgerFilterSheet from '../components/LedgerFilterSheet.jsx';

const roundBtn = (size = 36) => ({
  width: size, height: size, borderRadius: '50%', border: 'none', background: '#fff',
  boxShadow: '0 3px 12px rgba(25,23,34,.1)', cursor: 'pointer', color: '#6c6779',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none',
});

const SEARCH_STASH_KEY = 'ledger:search';

export default function Ledger() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') || currentMonth();
  const setMonth = useCallback((m) => {
    const next = new URLSearchParams(params);
    next.set('month', m);
    setParams(next, { replace: true });
  }, [params, setParams]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ income: 0, expense: 0 });
  const [view, setView] = useState('list'); // list | calendar
  const [selDay, setSelDay] = useState(null);
  // "+" 버튼 왼쪽의 촬영 버튼: 사진을 리사이즈까지만 미리 해서(용량 절감) 기록 페이지로
  // 넘기고, 실제 인식(Gemini 호출)은 기록 페이지가 뜬 뒤 자동으로 한 번 실행한다.
  const receiptInputRef = useRef(null);
  const [receiptPicking, setReceiptPicking] = useState(false);
  const onReceiptPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReceiptPicking(true);
    try {
      const { base64, mimeType } = await fileToResizedBase64(file);
      nav('/new', { state: { autoReceiptBase64: base64, autoReceiptMime: mimeType } });
    } catch {
      alert('사진을 불러오지 못했습니다.');
    } finally {
      setReceiptPicking(false);
    }
  };

  // 검색(전체 기간). 검색 결과에서 항목을 열었다가 돌아오면(X/저장/삭제) 검색어·필터를 그대로 복원한다.
  const [restoredSearch] = useState(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(SEARCH_STASH_KEY) || 'null');
      sessionStorage.removeItem(SEARCH_STASH_KEY);
      return v;
    } catch { return null; }
  });
  const rs = restoredSearch || {};
  const [searchOpen, setSearchOpen] = useState(!!restoredSearch);
  const searchRef = useRef(null);
  const [q, setQ] = useState(rs.q || '');
  const [sResults, setSResults] = useState([]);
  const [sLoading, setSLoading] = useState(false);
  const [showSearchFilter, setShowSearchFilter] = useState(!!rs.showSearchFilter);
  // 검색 기간: 전체 | 주별(이번 주) | 월별(이번 달) | 연별(올해) | 기간 선택(sFrom~sTo, 기본 최근 7일)
  const [sPeriod, setSPeriod] = useState(rs.sPeriod || 'all');
  const [sFrom, setSFrom] = useState(rs.sFrom || shiftDate(today(), -6));
  const [sTo, setSTo] = useState(rs.sTo || today());
  const sRange = useMemo(() => {
    if (sPeriod === 'all') return { from: '', to: '' };
    if (sPeriod === 'range') return { from: sFrom, to: sTo };
    const anchor = sPeriod === 'week' ? weekStartOf(today()) : sPeriod === 'year' ? currentYear() : currentMonth();
    const b = periodBounds(sPeriod, anchor);
    return { from: b.start, to: shiftDate(b.endExclusive, -1) };
  }, [sPeriod, sFrom, sTo]);
  const [sType, setSType] = useState(rs.sType || 'all');
  const [sCat, setSCat] = useState(Array.isArray(rs.sCat) ? rs.sCat : []); // 분류명 여러 개(빈 배열 = 전체)
  const [sSrc, setSSrc] = useState(Array.isArray(rs.sSrc) ? rs.sSrc : []); // 원천명 여러 개(빈 배열 = 전체)
  // 검색 중에 다른 화면(기록 수정/복사)으로 나갈 때 검색 상태를 잠깐 저장(돌아오면 위에서 한 번 읽고 지움)
  const stashSearch = () => {
    if (!searchOpen) return;
    try { sessionStorage.setItem(SEARCH_STASH_KEY, JSON.stringify({ q, showSearchFilter: false, sPeriod, sFrom, sTo, sType, sCat, sSrc })); } catch {}
  };

  // 이 달 필터
  const [typeFilter, setTypeFilter] = useState('all');
  const [catFilter, setCatFilter] = useState([]); // 분류명 여러 개(빈 배열 = 전체)
  const [srcFilter, setSrcFilter] = useState([]); // 원천명 여러 개(빈 배열 = 전체)
  const [showFilter, setShowFilter] = useState(false);
  const [catList, setCatList] = useState([]); // 필터 모달용 분류(이모지 포함)
  const [srcTree, setSrcTree] = useState([]); // 필터 모달용 원천(상위 → 하위)

  // 카드 길게 누르기 → 선택(수정) 모드: 여러 항목을 한 번에 삭제/일괄 수정
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState(null); // 'content' | 'date' | 'category' | 'source' | null
  const enterSelection = (id) => { setSelectionMode(true); setSelectedIds(new Set([id])); setBulkMenuOpen(false); };
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };
  const exitSelection = () => { setSelectionMode(false); setSelectedIds(new Set()); setBulkMenuOpen(false); };
  // 달을 바꾸거나 검색을 열면 지금 보이는 목록 자체가 바뀌므로 선택 모드는 해제
  useEffect(() => { exitSelection(); }, [month, searchOpen]);
  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    setBulkMenuOpen(false);
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제할까요?`)) return;
    try {
      for (const id of selectedIds) {
        const t = txs.find((x) => x.id === id);
        if (!t) continue;
        if (t.origin_type === 'payment') await db.deletePayment(t.origin_id);
        else if (t.origin_type === 'deposit') await db.deleteDeposit(t.origin_id);
        else await db.deleteTransaction(t.id);
      }
      exitSelection();
      load();
    } catch (e) { alert(e.message); }
  };
  const applyBulkEdit = async (patch) => {
    await db.bulkUpdateTransactions([...selectedIds], patch);
    setBulkEditField(null);
    exitSelection();
    load();
  };

  const load = useCallback(() => {
    setLoading(true);
    db.listLedger({ month, userId: user.id })
      .then(async (list) => {
        setTxs(list);
        const exList = list.filter((t) => t.type === 'expense');
        const map = await db.settlementsByTarget(exList.map((t) => t.id));
        const expense = exList.reduce((s, t) => s + Math.max(0, Number(t.amount) - (map[t.id] || 0)), 0);
        // 이 달에 들어온 정산 수입의 초과분(+가 되는 금액)은 대상 지출의 달이 아니라 이 달의 수입으로 계상
        const settleIncomeList = list.filter((t) => t.type === 'income' && isSettlementIncome(t));
        const excessMap = settleIncomeList.length ? await db.settlementExcessByRow() : {};
        const excess = settleIncomeList.reduce((s, t) => s + (excessMap[t.id] || 0), 0);
        const income = list.filter((t) => t.type === 'income' && !isSettlementIncome(t)).reduce((s, t) => s + Number(t.amount), 0) + excess;
        setSummary({ income, expense });
      })
      .catch(() => { setTxs([]); setSummary({ income: 0, expense: 0 }); })
      .finally(() => setLoading(false));
  }, [month, user.id]);

  useEffect(() => { load(); }, [load]);

  // 검색 필터 옵션(전체 분류/원천)
  useEffect(() => {
    db.listCategories().then(setCatList).catch(() => {});
    db.listSources().then(({ tree }) => setSrcTree(tree)).catch(() => {});
  }, []);

  const loadSearch = useCallback(() => {
    setSLoading(true);
    db.searchTransactions({
      from: sRange.from || undefined, to: sRange.to || undefined, type: sType, userId: user.id,
    })
      .then(setSResults).catch(() => setSResults([])).finally(() => setSLoading(false));
  }, [sRange.from, sRange.to, sType, user.id]);

  useEffect(() => { if (searchOpen) loadSearch(); }, [searchOpen, loadSearch]);

  const { income, expense } = summary;

  // 필터 모달의 분류 칩: 유형을 수입/지출로 고르면 그 유형의 분류만(같은 이름은 하나로)
  const categoriesFor = useCallback((t) => {
    const seen = new Set();
    return catList
      .filter((c) => (t === 'income' || t === 'expense') ? c.type === t : true)
      .filter((c) => c.name && !seen.has(c.name) && seen.add(c.name))
      .map((c) => ({ name: c.name, emoji: c.emoji || '' }));
  }, [catList]);
  const filterCategories = useMemo(() => categoriesFor(typeFilter), [categoriesFor, typeFilter]);
  const searchFilterCategories = useMemo(() => categoriesFor(sType), [categoriesFor, sType]);
  const filterSourceGroups = useMemo(() => srcTree.map((t) => ({ name: t.name, items: (t.children || []).map((c) => c.name) })), [srcTree]);

  const monthActive = typeFilter !== 'all' || catFilter.length > 0 || srcFilter.length > 0;
  const searchActive = !!(sPeriod !== 'all' || sType !== 'all' || sCat.length || sSrc.length);
  const filterActive = searchOpen ? searchActive : monthActive;

  const filtered = useMemo(() => txs.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (catFilter.length && !catFilter.includes(t.category_name || '')) return false;
    if (srcFilter.length && !srcFilter.includes(t.source_name || '') && !(t.type === 'transfer' && srcFilter.includes(t.to_source_name || ''))) return false;
    return true;
  }), [txs, typeFilter, catFilter, srcFilter]);
  // 상단(상단바+연월+요약카드)·하단(하단탭) 영역을 뺀 나머지 화면 정중앙에 빈 상태 문구 배치
  const isEmptyMonthList = !loading && view === 'list' && filtered.length === 0;

  // 검색 결과: 서버 구조 필터 + 화면 텍스트 필터
  const sFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sResults.filter((t) => {
      if (sCat.length && !sCat.includes(t.category_name || '')) return false;
      if (sSrc.length && !sSrc.includes(t.source_name || '') && !(t.type === 'transfer' && sSrc.includes(t.to_source_name || ''))) return false;
      if (!term) return true;
      return [t.content, t.category_name, t.source_name, t.memo].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [sResults, q, sCat, sSrc]);
  const sIncome = sFiltered.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const sExpense = sFiltered.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  
  const openSearch = () => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 260); };
  const closeSearch = () => { setSearchOpen(false); setShowSearchFilter(false); setQ(''); };
  const onSearchIcon = () => { if (searchOpen) searchRef.current?.focus(); else openSearch(); };
  const onFilterClick = () => { if (searchOpen) setShowSearchFilter((v) => !v); else setShowFilter((v) => !v); };

  // 보이는 항목(개인 항목 + 내가 속한 그룹의 공유 항목)은 누가 등록했든 전부 수정/삭제 가능.
  const canEdit = () => true;
  const openEdit = (t) => {
    stashSearch();
    if (t.origin_type === 'payment') nav(`/tx/${t.origin_id}?group=${t.origin_group_id}&kind=payment`);
    else if (t.origin_type === 'deposit') nav(`/tx/${t.origin_id}?group=${t.origin_group_id}&kind=deposit`);
    else if (t.origin_type) nav(`/groups/${t.origin_group_id}?edit=${t.origin_type}:${t.origin_id}`);
    else nav(`/tx/${t.id}`);
  };
  const remove = async (t) => {
    const msg = t.origin_type
      ? '이 항목을 삭제하면 그룹의 결제/입금 내역과 연결된 다른 가계부 항목도 함께 삭제됩니다. 계속할까요?'
      : '이 항목을 삭제할까요?';
    if (!confirm(msg)) return;
    try {
      if (t.origin_type === 'payment') await db.deletePayment(t.origin_id);
      else if (t.origin_type === 'deposit') await db.deleteDeposit(t.origin_id);
      else await db.deleteTransaction(t.id);
      load();
      if (searchOpen) loadSearch();
    } catch (e) { alert(e.message); }
  };
  // 카드를 왼쪽으로 밀어 복사: 그 기록과 똑같은 내용(분류/원천/내용/항목/금액)으로 오늘 날짜의
  // 새 기록 화면을 띄운다(기록 수정 화면의 복사 버튼과 동일한 경로 재사용). 저장 전까지는
  // 실제로 생성되지 않고, 저장/닫기 시 가계부로 바로 돌아오도록 closeTo 를 함께 보낸다.
  const copyTx = (t) => {
    stashSearch();
    const snapshot = {
      type: t.type, amount: t.amount,
      category_id: t.category_id, category_name: t.category_name,
      category_emoji: t.category_emoji, category_color: t.category_color,
      source_id: t.source_id, source_name: t.source_name,
      to_source_id: t.to_source_id, to_source_name: t.to_source_name,
      content: t.content, memo: t.memo, items: t.items || null,
    };
    nav('/new', { state: { favorite: snapshot, toast: '복사되었습니다', closeTo: '/' } });
  };

  // ----- 캘린더 뷰 데이터 -----
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  // 일요일/공휴일은 "일" 헤더와 같은 색, 토요일은 "토" 헤더와 같은 색(토요일이 공휴일이면 공휴일 색 우선)
  const [holidaySet, setHolidaySet] = useState(new Set());
  useEffect(() => {
    const pad = (n) => String(n).padStart(2, '0');
    db.listHolidays(`${month}-01`, `${month}-${pad(daysInMonth)}`)
      .then((rows) => setHolidaySet(new Set(rows.map((r) => r.date))))
      .catch(() => setHolidaySet(new Set()));
  }, [month, daysInMonth]);
  const perDay = useMemo(() => {
    const map = {};
    for (const t of filtered) {
      if (t.type === 'transfer') continue; // 이체는 수입/지출 통계에 안 잡힘
      const d = Number(t.date.slice(8, 10));
      (map[d] ||= { income: 0, expense: 0 });
      map[d][t.type === 'income' ? 'income' : 'expense'] += Number(t.amount);
    }
    return map;
  }, [filtered]);
  const dayTxs = useMemo(() => (selDay ? filtered.filter((t) => Number(t.date.slice(8, 10)) === selDay) : []), [filtered, selDay]);

  const [yy, mm] = month.split('-');
  const label = `${yy} 년 ${Number(mm)} 월`;

  return (
    <div style={{ padding: '44px 0 12px' }}>
      {/* 상단바 (가계부 · 검색 · 필터, 선택 모드일 때는 완전히 다른 구성) — 스크롤 무관 고정 */}
      {selectionMode ? (
        <div className="simple-topbar flat">
          <button aria-label="선택 모드 종료" className="tb-icon-btn" onClick={exitSelection}>
            <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
          </button>
          <div className="title">수정</div>
          <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button aria-label="선택 항목 삭제" className="tb-icon-btn" onClick={bulkDelete}>
              <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            <div style={{ position: 'relative' }}>
              <button aria-label="선택 항목 일괄 수정" className="tb-icon-btn" onClick={() => setBulkMenuOpen((v) => !v)}>
                <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              {bulkMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setBulkMenuOpen(false)} />
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 40, minWidth: 148,
                    background: '#fff', borderRadius: 14, boxShadow: '0 10px 28px rgba(25,23,34,.16)', overflow: 'hidden',
                  }}>
                    {[
                      ['content', '내용 일괄 수정'], ['date', '날짜 일괄 수정'],
                      ['category', '분류 일괄 수정'], ['source', '원천 일괄 수정'],
                    ].map(([key, label], i) => (
                      <button
                        key={key} type="button"
                        onClick={() => { setBulkMenuOpen(false); setBulkEditField(key); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none',
                          borderTop: i === 0 ? 'none' : '1px solid #f6f5f3', background: 'transparent',
                          fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#191722', cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="ledger-topbar">
          <div className="lt-title" style={{ opacity: searchOpen ? 0 : 1, transition: 'opacity 0.26s ease', pointerEvents: searchOpen ? 'none' : 'auto' }}>가계부</div>
          <button aria-label="필터" className={`lt-filter${filterActive ? ' on' : ''}`} onClick={onFilterClick}>
            <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 4 21 4 14 13 14 20 10 22 10 13 3 4" /></svg>
          </button>
          <div className={`lt-search${searchOpen ? ' open' : ''}`}>
            <button aria-label="검색" className="lt-search-icon" onClick={onSearchIcon}>
              <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" /></svg>
            </button>
            <input
              ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
              placeholder="검색어 입력" tabIndex={searchOpen ? 0 : -1}
            />
            {searchOpen && (
              <button aria-label="닫기" className="lt-search-close" onClick={closeSearch}>
                <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
              </button>
            )}
          </div>
        </div>
      )}

      {bulkEditField && (
        <BulkEditModal
          field={bulkEditField} count={selectedIds.size}
          onClose={() => setBulkEditField(null)} onApply={applyBulkEdit}
        />
      )}

      {searchOpen ? (
        /* ===== 검색 모드 (전체 기간, 모든 카드) ===== */
        <>
          {/* 검색 필터: 가계부 필터와 같은 하단 모달 + 기간 설정 */}
          {showSearchFilter && (
            <LedgerFilterSheet
              categories={searchFilterCategories} sourceGroups={filterSourceGroups}
              filterType={sType} setFilterType={setSType}
              filterCats={sCat} setFilterCats={setSCat}
              filterSrcs={sSrc} setFilterSrcs={setSSrc}
              period={{ mode: sPeriod, setMode: setSPeriod, from: sFrom, to: sTo, setFrom: setSFrom, setTo: setSTo }}
              onClose={() => setShowSearchFilter(false)}
            />
          )}

          {(sLoading || sFiltered.length > 0) && (
            <div className="small muted" style={{ margin: '2px 2px 10px' }}>
              결과 {sFiltered.length}건 · <span style={{ color: 'var(--income)', fontWeight: 700 }}>+{fmtNum(sIncome)}</span> · <span style={{ color: 'var(--expense)', fontWeight: 700 }}>-{fmtNum(sExpense)}</span>
            </div>
          )}

          {sLoading ? (
            <Spinner />
          ) : (
            <TransactionList
              transactions={sFiltered} canEdit={canEdit} onEdit={openEdit} onDelete={remove} onCopy={copyTx} dateFormat="full"
              emptyText="데이터가 없습니다." emptyCenter="notabs"
            />
          )}
        </>
      ) : (
        /* ===== 가계부 모드 (당월) ===== */
        <>
          {/* 월 이동 — 선택 모드에서는 지금 보는 달 대신 선택 개수 안내로 바뀜 */}
          {selectionMode ? (
            <div style={{ marginTop: 3, padding: '7px 2px 7px 8px', fontSize: 12, fontWeight: 400, color: '#a29ead' }}>
              {selectedIds.size} 건 선택되었습니다
            </div>
          ) : (
            <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button aria-label="이전 달" onClick={() => { setMonth(shiftMonth(month, -1)); setSelDay(null); }} style={roundBtn(32)}>
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
              </button>
              {/* 가운데 연월 텍스트를 누르면 네이티브 월 선택기가 떠서 직접 고를 수 있음(텍스트는 숨긴 input 아래 그대로 보임) */}
              <div style={{ position: 'relative', minWidth: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722', letterSpacing: '-.2px' }}>{label}</span>
                <input
                  type="month" value={month} aria-label="연월 선택" className="catmodal-date-input"
                  onChange={(e) => { if (e.target.value) { setMonth(e.target.value); setSelDay(null); } }}
                />
              </div>
              <button aria-label="다음 달" onClick={() => { setMonth(shiftMonth(month, 1)); setSelDay(null); }} style={roundBtn(32)}>
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
              </button>
            </div>
          )}

          {/* 이 달 필터: 하단 모달 */}
          {showFilter && (
            <LedgerFilterSheet
              categories={filterCategories} sourceGroups={filterSourceGroups}
              filterType={typeFilter} setFilterType={setTypeFilter}
              filterCats={catFilter} setFilterCats={setCatFilter}
              filterSrcs={srcFilter} setFilterSrcs={setSrcFilter}
              onClose={() => setShowFilter(false)}
            />
          )}

          {/* 요약 카드 + 고양이/말풍선 (고양이 하단이 박스 상단에 딱 붙어 함께 이동) */}
          <div style={{ position: 'relative', marginTop: 8 }}>
            <div style={{ position: 'absolute', right: 8, bottom: '100%', marginBottom: 0, display: 'flex', alignItems: 'flex-end', gap: 3, zIndex: 3 }}>
              <button aria-label="뷰 전환" onClick={() => setView((v) => (v === 'list' ? 'calendar' : 'list'))}
                style={{ position: 'relative', width: 34, height: 26, borderRadius: 12, border: 'none', background: '#eceae7', color: '#4a4640', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flex: 'none', marginBottom: 12 }}>
                <svg width="8" height="7.5" viewBox="0 0 8 7.5" style={{ position: 'absolute', right: 3, bottom: -4.5, pointerEvents: 'none' }} aria-hidden="true"><path d="M1.1 0 Q-0.8 5.3 7.9 6.8 Q4.7 4.7 4.2 0 Z" fill="#eceae7" /></svg>
                {view === 'list' ? (
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="6" /><line x1="16" y1="3" x2="16" y2="6" /></svg>
                ) : (
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" /></svg>
                )}
              </button>
              <CatMascot width={70} />
            </div>
            <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 6px 20px rgba(25,23,34,.07)', display: 'flex', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>수입</div><div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#2CDDB9' }}>{fmtNum(income)}</div></div>
              <div style={{ width: 1, height: 30, background: '#efeef2' }} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>지출</div><div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#FF4358' }}>{fmtNum(expense)}</div></div>
              <div style={{ width: 1, height: 30, background: '#efeef2' }} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>합계</div><div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#191722' }}>{fmtNum(income - expense)}</div></div>
            </div>
          </div>

          <div style={isEmptyMonthList ? { minHeight: 'calc(100vh - 302px - env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', justifyContent: 'center' } : undefined}>
            {loading ? (
              <Spinner />
            ) : view === 'calendar' ? (
              <>
                <div style={{ marginTop: 16, background: '#fff', borderRadius: 20, padding: '14px 12px 12px', boxShadow: '0 4px 16px rgba(25,23,34,.05)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#a29ead' }}>
                    <span style={{ color: '#e0607a' }}>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style={{ color: '#7b93c9' }}>토</span>
                  </div>
                  <div style={{ marginTop: 7, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                    {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const pd = perDay[day];
                      const sel = selDay === day;
                      const dow = (firstDow + i) % 7;
                      const isHoliday = holidaySet.has(`${month}-${String(day).padStart(2, '0')}`);
                      const dayColor = isHoliday || dow === 0 ? '#e0607a' : dow === 6 ? '#7b93c9' : (sel ? '#191722' : '#6c6779');
                      return (
                        <div key={day} onClick={() => setSelDay(sel ? null : day)}
                          style={{
                            minHeight: 54, borderRadius: 10, padding: '5px 2px 3px', textAlign: 'center', cursor: 'pointer',
                            background: sel ? '#FFF0DC' : 'transparent',
                          }}>
                          <div style={{ fontSize: 11, fontWeight: sel ? 800 : 600, color: dayColor }}>{day}</div>
                          {pd?.expense > 0 && <div style={{ marginTop: 2, fontSize: 8, fontWeight: 700, letterSpacing: '-.3px', color: '#FF4358' }}>-{fmtNum(pd.expense)}</div>}
                          {pd?.income > 0 && <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '-.3px', color: '#2CDDB9' }}>+{fmtNum(pd.income)}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <TransactionList
                    transactions={selDay ? dayTxs : filtered} canEdit={canEdit} onEdit={openEdit} onDelete={remove} onCopy={copyTx} emptyText="기록이 없습니다."
                    selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} onLongPress={enterSelection}
                  />
                </div>
              </>
            ) : (
              <TransactionList
                transactions={filtered} canEdit={canEdit} onEdit={openEdit} onDelete={remove} onCopy={copyTx} emptyText="기록이 없습니다."
                selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} onLongPress={enterSelection}
              />
            )}
          </div>

          {!selectionMode && (
            <>
              <input
                ref={receiptInputRef} type="file" accept="image/*"
                style={{ display: 'none' }} onChange={onReceiptPick}
              />
              <button
                type="button" className="fab-camera" onClick={() => receiptInputRef.current?.click()}
                disabled={receiptPicking} aria-label="영수증으로 기록"
              >
                {receiptPicking ? (
                  <span style={{ width: 15, height: 15, border: '2px solid #e4e2e6', borderTopColor: '#6c6779', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <svg width="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                )}
              </button>
              <button className="fab" onClick={() => nav('/new')} aria-label="추가">
                <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
