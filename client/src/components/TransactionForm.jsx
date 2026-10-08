import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, dotDate, fmtWon, fmtNum, renderTemplate } from '../lib/format.js';
import { resolveRecurrence, countDueDates } from '../lib/recurrence.js';
import CalcAmountInput from './CalcAmountInput.jsx';
import RecurrenceModal from './RecurrenceModal.jsx';
import ConfirmModal from './ConfirmModal.jsx';

// "반복 관리" 메뉴와 동일한 반복 아이콘(채워진 순환 화살표)
const RepeatIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={color}>
    <path d="M12,4V1L8,5l4,4V6c3.31,0,6,2.69,6,6c0,1.01-0.25,1.97-0.7,2.8l1.46,1.46C19.54,15.03,20,13.57,20,12C20,7.58,16.42,4,12,4z M6,12c0-1.01,0.25-1.97,0.7-2.8L5.24,7.74C4.46,8.97,4,10.43,4,12c0,4.42,3.58,8,8,8v3l4-4l-4-4v3c-3.31,0-6-2.69-6-6z" />
  </svg>
);
const RemoveIcon = () => (
  <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
);

// 분류/원천에 id 는 없고 이름(스냅샷)만 있는 항목(그룹 자동기입 등)을 표시하기 위한 센티넬
const SNAP = '__snap__';

// 정산 참여 멤버 금액 균등분배: 내림으로 나누고 남는 1원 단위는 앞쪽 멤버부터 1원씩 더 받음
function equalSplitAmounts(count, total) {
  if (!count) return [];
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
// 항목 하나(행)의 참여 멤버별 금액을 계산(체크 해제된 멤버는 0, 직접 수정한 금액은 그대로 유지)
function memberRowsFor(item, members, total) {
  const checkedIds = members.filter((m) => item.memberChecked?.[m.id] !== false).map((m) => m.id);
  const shares = equalSplitAmounts(checkedIds.length, total);
  const shareOf = {};
  checkedIds.forEach((id, i) => { shareOf[id] = shares[i]; });
  return members.map((m) => {
    const checked = item.memberChecked?.[m.id] !== false;
    const override = item.memberAmountOverride?.[m.id];
    return { id: m.id, name: m.nickname, isOwner: m.role === 'owner', checked, amount: checked ? (override ?? (shareOf[m.id] || 0)) : 0 };
  });
}
const itemTotalOf = (it) => (Number(it.amount) || 0) * (Number(it.qty) || 1);
const emptyItem = () => ({ name: '', qty: '1', amount: '', currencyMeta: null, expanded: false, memberChecked: {}, memberAmountOverride: {} });

// 사진 파일을 리사이즈 후 base64(순수 데이터, data: 접두어 제외)로 변환(전송 용량 절감용)
async function fileToResizedBase64(file, maxSize = 1600, quality = 0.85) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  URL.revokeObjectURL(img.src);
  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

// 영수증형 항목 입력 행 한 줄(내용/수량(또는 회차)/금액 [+정산 그룹이면 참여 멤버 펼치기]).
function ItemRow({ item, idx, canRemove, qtyLabel, settlementMembers, onName, onQty, onAmount, onCurrencyChange, onRemove, onToggleExpand, onToggleMember, onMemberAmount }) {
  const hasSplit = !!settlementMembers?.length;
  const cols = hasSplit ? '1fr 14px 46px 84px 18px' : '1fr 46px 84px 18px';
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '5px 0' }}>
        <input
          type="text" placeholder="항목 기입" value={item.name} onChange={(e) => onName(e.target.value)}
          style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, color: '#191722', outline: 'none', minWidth: 0 }}
        />
        {hasSplit && (
          <button
            type="button" aria-label="참여 멤버 펼치기" onClick={onToggleExpand}
            style={{ width: 20, height: 20, border: 'none', background: 'transparent', color: '#8b8798', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: item.expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        )}
        <input
          type="text" inputMode="numeric" placeholder="1" value={item.qty} onChange={(e) => onQty(e.target.value)}
          style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, color: '#191722', outline: 'none', textAlign: 'center', minWidth: 0 }}
        />
        <CalcAmountInput
          compact value={item.amount} onChange={onAmount}
          initialCurrency={item.currencyMeta?.input_currency} initialForeignAmount={item.currencyMeta?.input_amount}
          onCurrencyChange={onCurrencyChange}
        />
        {canRemove ? (
          <button type="button" aria-label="행 삭제" onClick={onRemove} style={{ width: 18, height: 18, border: 'none', background: 'transparent', color: '#c2bfc6', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RemoveIcon />
          </button>
        ) : <span />}
      </div>
      {hasSplit && item.expanded && (
        <div style={{ padding: '2px 0 6px 14px' }}>
          {memberRowsFor(item, settlementMembers, itemTotalOf(item)).map((m) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '2px 0' }}>
              <span style={{ gridColumn: '1 / span 3', display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, fontSize: 11.5, color: '#6c6779' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                {m.isOwner && <span style={{ flex: 'none', fontSize: 8, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '1px 6px' }}>총무</span>}
              </span>
              <input
                type="text" inputMode="numeric" disabled={!m.checked}
                value={m.checked ? Number(m.amount).toLocaleString('ko-KR') : ''}
                onChange={(e) => onMemberAmount(m.id, e.target.value.replace(/[^0-9]/g, ''))}
                style={{ gridColumn: 4, width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 11.5, color: '#8b8798', textAlign: 'right', outline: 'none', minWidth: 0, padding: 0, opacity: m.checked ? 1 : 0.4 }}
              />
              <input
                type="checkbox" checked={m.checked} onChange={() => onToggleMember(m.id)}
                style={{ gridColumn: 5, width: 14, height: 14, cursor: 'pointer', justifySelf: 'center', accentColor: '#6c6779' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 수입/지출 항목 작성·수정 폼(영수증형: 대표 내용 + 항목별 행 + 합계). groupId 지정 시 그룹 항목으로 저장.
// fixedType 지정 시 수입/지출 토글을 숨기고 해당 유형으로 고정(예: 그룹 결제=지출).
// defaultCategoryName 지정 시 신규 작성 때 해당 이름의 분류를 기본 선택.
// defaultAmount 지정 시 신규 작성 때 항목 금액을 이 값으로 자동 채움(예: 그룹 결제 → 정기결제금액).
// defaultContentTemplate 지정 시 신규 작성 때 "내용"을 이 템플릿({연}/{월}/{일} 변수 지원)으로 자동 채우고,
// 날짜를 바꾸면 그 날짜 기준으로 다시 채워짐.
// onSubmit 지정 시 db.saveTransaction 대신 이 함수로 저장을 위임(그룹 결제 등 별도 저장 로직).
// qtyLabel: 항목 표의 수량 칸 라벨(기본 "수량", 구독 그룹 결제는 "회차").
// settlementMembers 지정 시(정산 그룹 결제 내역) 각 항목 행에 참여 멤버 펼치기가 생기고, 기본 전원
// 체크·균등분배되며 체크 해제/금액 직접 수정이 가능하다. 저장 시 모든 항목의 합산액이 멤버별로 저장된다.
// initialSettlementSplit 은 기존 저장된 분담 내역([{member_id, amount}])으로, 수정 화면에서 비동기로
// 나중에 도착해도(아직 undefined 인 동안은 초기화를 기다림) 첫 번째 항목 행에 반영된다.
// groupBadge 지정 시({name, color}) 내용 입력 아래에 그룹 배지가 뜬다.
const TransactionForm = forwardRef(function TransactionForm({
  initial, groupId, onSaved, onClose, fixedType, defaultCategoryName, defaultAmount, defaultContentTemplate,
  onSubmit, topNotice, showPeriods, onScanBusyChange, initialPendingRecurrence,
  settlementMembers, initialSettlementSplit, qtyLabel = '수량', groupBadge,
}, ref) {
  const { user } = useAuth();
  const nav = useNavigate();
  const editing = !!initial?.id;
  const [type, setType] = useState(fixedType || initial?.type || 'expense');
  const [date, setDate] = useState(initial?.date || today());
  const [periods, setPeriods] = useState(initial?.periods ? String(initial.periods) : '1');
  const [categoryId, setCategoryId] = useState(
    initial?.category_id ? String(initial.category_id) : (initial?.category_name ? SNAP : '')
  );
  const [sourceId, setSourceId] = useState(
    initial?.source_id ? String(initial.source_id) : (initial?.source_name ? SNAP : '')
  );
  const [items, setItems] = useState(() => (
    Array.isArray(initial?.items) && initial.items.length
      ? initial.items.map((it) => ({ ...emptyItem(), name: it.name || '', qty: String(it.qty || 1), amount: it.amount ? String(it.amount) : '' }))
      : [{ ...emptyItem(), amount: initial?.amount ? String(initial.amount) : (defaultAmount ? String(defaultAmount) : '') }]
  ));
  const [contentOverride, setContentOverride] = useState(initial?.content ?? null);
  const [memo, setMemo] = useState(initial?.memo || '');
  const memoRef = useRef(null);
  const [settlementTargetId, setSettlementTargetId] = useState(initial?.settlement_target_id ? String(initial.settlement_target_id) : '');
  // 반복 설정: 이미 저장된 반복(recurringId)이거나, 아직 저장 전인 선택값(pendingRecurrence) 중 하나만 있을 수 있음
  const [recurringId, setRecurringId] = useState(initial?.recurring?.id || null);
  const [recurringLabel, setRecurringLabel] = useState(initial?.recurring?.label || '');
  const [pendingRecurrence, setPendingRecurrence] = useState(initialPendingRecurrence || null);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [backfillPrompt, setBackfillPrompt] = useState(null); // { n, resolve } | null
  const askBackfill = (n) => new Promise((resolve) => setBackfillPrompt({ n, resolve }));

  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [sourcesFlat, setSourcesFlat] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [contentSuggestions, setContentSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const receiptInputRef = useRef(null);

  useImperativeHandle(ref, () => ({ openReceiptPicker: () => receiptInputRef.current?.click() }), []);
  useEffect(() => { onScanBusyChange?.(scanBusy); }, [scanBusy]);

  useEffect(() => {
    db.listCategories().then((cs) => {
      setCategories(cs);
      // 신규 작성 시 기본 분류 자동 선택(예: 그룹 결제 → '구독')
      if (!editing && !categoryId && defaultCategoryName) {
        const c = cs.find((x) => x.type === (fixedType || type) && x.name === defaultCategoryName);
        if (c) setCategoryId(String(c.id));
      }
    }).catch(() => {});
    db.listSources().then(({ tree, flat }) => { setSources(tree); setSourcesFlat(flat); }).catch(() => {});
    db.listRecentExpenses(user.id, { includeId: initial?.settlement_target_id || null }).then(setRecentExpenses).catch(() => {});
    db.listContentSuggestions(user.id).then(setContentSuggestions).catch(() => {});
  }, []);

  // 신규 작성 시 "내용" 기본값 템플릿 적용(비동기로 나중에 도착해도 반영)
  useEffect(() => {
    if (!editing && contentOverride == null && defaultContentTemplate) setContentOverride(renderTemplate(defaultContentTemplate, date));
  }, [defaultContentTemplate]);

  // 신규 작성 시 금액 기본값(예: 구독 그룹 결제 → 정기결제금액) 적용(비동기로 나중에 도착해도 반영).
  // 아직 아무것도 입력 안 한 첫 항목 하나뿐일 때만 채운다(사용자가 이미 입력했으면 덮어쓰지 않음).
  useEffect(() => {
    if (editing || !defaultAmount) return;
    setItems((prev) => (prev.length === 1 && !prev[0].name && !prev[0].amount)
      ? [{ ...prev[0], amount: String(defaultAmount) }] : prev);
  }, [defaultAmount]);

  // 신규 작성 시 원천 기본값: 지출은 주결제수단, 수입은 주입금수단(원천 관리에서 지정한 것)
  useEffect(() => {
    if (editing || sourceId) return;
    const key = type === 'expense' ? 'is_primary_payment' : 'is_primary_deposit';
    const s = sourcesFlat.find((x) => x[key]);
    if (s) setSourceId(String(s.id));
  }, [editing, type, sourcesFlat]);

  // 메모가 바뀌면(사용자 입력/영수증 인식 등) 높이를 내용에 맞게 늘림
  useEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [memo]);

  const onDateChange = (v) => {
    setDate(v);
    if (!editing && defaultContentTemplate) setContentOverride(renderTemplate(defaultContentTemplate, v));
  };

  // 반복 아이콘 클릭: 이미 저장된 반복이면 해제 확인, 선택만 해둔 상태면 선택 취소, 둘 다 아니면 모달을 띄움
  const onRecurrenceIconClick = async () => {
    if (recurringId) {
      if (!confirm(`'${recurringLabel || '반복'}' 설정을 해제할까요? (이미 기록된 내역은 그대로 남습니다)`)) return;
      try { await db.deleteRecurringRule(recurringId); setRecurringId(null); setRecurringLabel(''); } catch (err) { alert(err.message); }
      return;
    }
    if (pendingRecurrence) { setPendingRecurrence(null); return; }
    setShowRecurrenceModal(true);
  };

  // 항목 행 조작
  const updateItem = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  const toggleItemExpand = (idx) => updateItem(idx, { expanded: !items[idx].expanded });
  const toggleItemMember = (idx, memberId) => setItems((prev) => prev.map((it, i) => {
    if (i !== idx) return it;
    const checked = it.memberChecked?.[memberId] !== false;
    const memberAmountOverride = { ...it.memberAmountOverride };
    delete memberAmountOverride[memberId]; // 체크 상태가 바뀌면 직접 수정한 금액은 초기화(자동 재계산)
    return { ...it, memberChecked: { ...it.memberChecked, [memberId]: !checked }, memberAmountOverride };
  }));
  const setItemMemberAmount = (idx, memberId, v) => updateItem(idx, {
    memberAmountOverride: { ...items[idx].memberAmountOverride, [memberId]: Math.max(0, Number(v) || 0) },
  });

  // 영수증 사진 선택 → Gemini 로 날짜/금액/상호명/분류 추출 → 폼에 제안값으로 채움(항상 사용자가 확인 후 저장)
  const onReceiptFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanError('');
    setScanBusy(true);
    try {
      const { base64, mimeType } = await fileToResizedBase64(file);
      const expenseCategoryNames = categories.filter((c) => c.type === 'expense').map((c) => c.name);
      const result = await db.parseReceipt(base64, mimeType, expenseCategoryNames);
      if (!fixedType) setType('expense');
      if (result.date) onDateChange(result.date);
      if (result.merchant) setContentOverride(result.merchant);
      if (result.category) {
        const c = categories.find((x) => x.type === 'expense' && x.name === result.category);
        if (c) setCategoryId(String(c.id));
      }
      // 구매 품목을 항목 행에 하나씩 채워줌(수량이 따로 적혀 있지 않으면 1).
      // 품목을 구분 못 했을 때만 총액 하나로 채운다.
      if (Array.isArray(result.items) && result.items.length) {
        setItems(result.items.map((it) => ({ ...emptyItem(), name: it.name || '', qty: String(it.qty || 1), amount: String(it.amount || '') })));
      } else if (result.amount) {
        updateItem(0, { amount: String(result.amount) });
      }
      if (!result.date && !result.amount && !result.merchant && !result.category) {
        setScanError('영수증에서 정보를 인식하지 못했어요. 직접 입력해 주세요.');
      }
    } catch (err) {
      setScanError(err.message || '영수증 인식에 실패했습니다.');
    } finally {
      setScanBusy(false);
    }
  };

  const catOptions = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const selCategory = categories.find((c) => String(c.id) === String(categoryId));
  const isSettlement = type === 'income' && selCategory?.name === '정산';

  // 정산 그룹 결제 내역: 항목 행마다 참여 멤버 펼치기 + 멤버별 분담액(균등분배가 기본, 직접 수정 가능)
  const showMemberSplit = !!settlementMembers?.length && type === 'expense';
  const splitInitRef = useRef(false);
  useEffect(() => {
    if (splitInitRef.current) return;
    if (!showMemberSplit) return;
    if (editing && initialSettlementSplit === undefined) return; // 수정 화면: 기존 분담 내역 도착 대기
    splitInitRef.current = true;
    if (!initialSettlementSplit?.length) return; // 신규이거나 저장된 분담이 없으면 기본값(전원 체크) 유지
    const memberChecked = {}; const memberAmountOverride = {};
    const checkedIds = new Set(initialSettlementSplit.map((r) => r.member_id));
    for (const m of settlementMembers) memberChecked[m.id] = checkedIds.has(m.id);
    for (const r of initialSettlementSplit) memberAmountOverride[r.member_id] = Number(r.amount);
    setItems((prev) => prev.map((it, i) => (i === 0 ? { ...it, memberChecked, memberAmountOverride } : it)));
  }, [showMemberSplit, initialSettlementSplit, editing]);

  const total = items.reduce((s, it) => s + itemTotalOf(it), 0);
  const autoContent = items.length > 1 ? `${items[0].name || ''} 외 ${items.length - 1}` : (items[0].name || '');
  const contentValue = contentOverride ?? autoContent;
  // 입력 중에는 지워도 그대로 빈 칸으로 둬서 자유롭게 다시 쓸 수 있게 하고, 포커스를 벗어났을 때
  // 비어 있으면 그제서야 자동 모드(항목명 기반)로 복귀한다.
  const onContentChange = (e) => setContentOverride(e.target.value);
  const onContentBlur = () => { if (contentOverride === '') setContentOverride(null); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!total) return setError('금액을 입력하세요.');
    const aggregateSplit = showMemberSplit ? (() => {
      const totals = {};
      for (const it of items) {
        for (const r of memberRowsFor(it, settlementMembers, itemTotalOf(it))) {
          if (r.checked) totals[r.id] = (totals[r.id] || 0) + r.amount;
        }
      }
      return Object.entries(totals).map(([id, amount]) => ({ member_id: Number(id), amount }));
    })() : null;
    if (showMemberSplit && !aggregateSplit.length) return setError('정산에 참여할 멤버를 1명 이상 선택하세요.');
    setBusy(true);

    // 분류 결정 (SNAP=기존 스냅샷 유지 / 실제 선택 / 선택 안 함)
    let category_id = null, category_name = '', category_emoji = '', category_color = '';
    if (categoryId === SNAP) {
      category_name = initial?.category_name || '';
      category_emoji = initial?.category_emoji || '';
      category_color = initial?.category_color || '';
    } else if (categoryId) {
      const c = categories.find((x) => String(x.id) === String(categoryId));
      if (c) { category_id = Number(c.id); category_name = c.name; category_emoji = c.emoji || ''; category_color = c.color || ''; }
    }

    // 원천 결정 (source_name 은 명시 전달 → db 가 그대로 사용)
    let source_id = null, source_name = '';
    if (sourceId === SNAP) {
      source_name = initial?.source_name || '';
    } else if (sourceId) {
      source_id = Number(sourceId);
      const s = sourcesFlat.find((x) => x.id === source_id);
      if (s) source_name = s.name; // 세부 항목명만
    }

    const recurrence = (!recurringId && pendingRecurrence) ? resolveRecurrence(pendingRecurrence, date) : null;
    // 과거 날짜로 반복을 새로 걸면, 그동안 밀린 회차를 한 번에 생성할지 물어봄
    let backfillPast = false;
    if (recurrence && date < today()) {
      const n = countDueDates(recurrence, date, today());
      if (n > 0) backfillPast = await askBackfill(n);
    }

    // 외화 입력 스냅샷: 여러 항목 중 외화로 입력한 첫 항목 기준(보통 항목 1개 또는 전부 원화라 충분함)
    const currencyItem = items.find((it) => it.currencyMeta);
    // 항목별 행(내용/수량/금액)을 그대로 저장해 수정 화면에서도 다시 보이도록 함
    const savedItems = items
      .filter((it) => it.name.trim() || Number(it.amount) > 0)
      .map((it) => ({ name: it.name.trim(), qty: Number(it.qty) || 1, amount: Number(it.amount) || 0 }));
    const payload = {
      type, date, amount: Math.round(total),
      category_id, category_name, category_emoji, category_color,
      source_id, source_name,
      content: (contentValue || '').trim(), memo,
      items: savedItems.length ? savedItems : null,
      input_currency: currencyItem?.currencyMeta?.input_currency || null,
      input_amount: currencyItem?.currencyMeta?.input_amount ?? null,
      fx_rate: currencyItem?.currencyMeta?.fx_rate ?? null,
      recurrence, backfillPast,
      settlement_target_id: (isSettlement && settlementTargetId) ? Number(settlementTargetId) : null,
      group_id: groupId || null,
      ...(showPeriods ? { periods: Math.max(Number(periods) || 1, 1) } : {}),
    };
    try {
      if (onSubmit) await onSubmit(payload);
      else {
        const saved = await db.saveTransaction({ id: initial?.id, userId: user.id, payload, sourcesFlat });
        if (aggregateSplit) await db.saveSettlementSplit(saved.id, aggregateSplit);
      }
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rowLabelStyle = { width: 46, flex: 'none', fontSize: 13.5, fontWeight: 400, color: '#8b8798' };
  const rowInputStyle = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#191722', outline: 'none', textAlign: 'right', padding: 0 };

  return (
    <form onSubmit={submit}>
      {topNotice}

      {!fixedType && (
        <>
          <input
            ref={receiptInputRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={onReceiptFile}
          />
          {scanError && <p className="small muted" style={{ margin: '0 2px 12px', color: '#FF4358' }}>{scanError}</p>}
        </>
      )}

      {!fixedType && (
        <div className="type-pill">
          <button type="button" className={`income ${type === 'income' ? 'active' : ''}`} onClick={() => { setType('income'); setCategoryId(''); setSourceId(''); }}>수입</button>
          <button type="button" className={`expense ${type === 'expense' ? 'active' : ''}`} onClick={() => { setType('expense'); setCategoryId(''); setSourceId(''); }}>지출</button>
        </div>
      )}

      {showRecurrenceModal && (
        <RecurrenceModal onClose={() => setShowRecurrenceModal(false)} onSelect={(p) => { setPendingRecurrence(p); setShowRecurrenceModal(false); }} />
      )}
      {backfillPrompt && (
        <ConfirmModal
          message={`과거의 반복 내역 ${backfillPrompt.n}개를 일괄 생성할까요?`}
          onYes={() => { backfillPrompt.resolve(true); setBackfillPrompt(null); }}
          onNo={() => { backfillPrompt.resolve(false); setBackfillPrompt(null); }}
        />
      )}

      <div className="rcpt-card">
        <input
          type="text" list="tx-content-list" placeholder="내용" value={contentValue} onChange={onContentChange} onBlur={onContentBlur} autoComplete="off"
          style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 20, fontWeight: 800, color: '#191722', outline: 'none', padding: groupBadge ? '0 0 6px' : '0 0 14px' }}
        />
        <datalist id="tx-content-list">
          {contentSuggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
        {groupBadge && (
          <span style={{ display: 'inline-block', marginBottom: 10, padding: '3px 9px', borderRadius: 999, background: groupBadge.color || '#e4e2e6', fontSize: 10.5, fontWeight: 700, color: '#6c6779' }}>
            {groupBadge.name}
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
          <span style={rowLabelStyle}>날짜</span>
          <div style={{ flex: 1, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#191722' }}>{dotDate(date)}</span>
              <input
                type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="catmodal-date-input" aria-label="날짜 선택"
              />
            </div>
            <button
              type="button" onClick={onRecurrenceIconClick} aria-label="반복 설정"
              style={{
                border: 'none', background: 'transparent', padding: 0, flex: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0,
              }}
            >
              <RepeatIcon color={!(recurringId || pendingRecurrence) ? '#c7c3cc' : (type === 'income' ? '#2CDDB9' : '#FF6F91')} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
          <span style={rowLabelStyle}>분류</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...rowInputStyle, appearance: 'none', textAlignLast: 'right' }}>
            <option value="">선택 안 함</option>
            {categoryId === SNAP && (
              <option value={SNAP}>{initial?.category_emoji ? `${initial.category_emoji} ` : ''}{initial?.category_name} (기존)</option>
            )}
            {catOptions.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
          <span style={rowLabelStyle}>원천</span>
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ ...rowInputStyle, appearance: 'none', textAlignLast: 'right' }}>
            <option value="">선택 안 함</option>
            {sourceId === SNAP && <option value={SNAP}>{initial?.source_name} (기존)</option>}
            {sources.map((top) => (
              top.children?.length ? (
                <optgroup key={top.id} label={top.name}>
                  <option value={top.id}>{top.name} (전체)</option>
                  {top.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ) : (
                <option key={top.id} value={top.id}>{top.name}</option>
              )
            ))}
          </select>
        </div>

        {isSettlement && (
          <div style={{ padding: '6px 0' }}>
            <div style={{ fontSize: 12, color: '#8b8798', marginBottom: 4 }}>정산 대상 <span style={{ opacity: .7 }}>(정산할 지출 선택)</span></div>
            <select value={settlementTargetId} onChange={(e) => setSettlementTargetId(e.target.value)} style={{ width: '100%', border: '1px solid #e4e2e6', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13.5, color: '#191722', background: '#fff' }}>
              <option value="">선택 안 함</option>
              {recentExpenses.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.date.slice(5)} {x.category_emoji || ''} {x.content || x.category_name || '지출'} ({fmtWon(x.amount)})
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: showMemberSplit ? '1fr 14px 46px 84px 18px' : '1fr 46px 84px 18px', gap: 8, padding: '8px 0', borderTop: '1px dashed #cfccd4', borderBottom: '1px dashed #cfccd4' }}>
          <span style={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798' }}>내용</span>
          {showMemberSplit && <span />}
          <span style={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798', textAlign: 'center' }}>{qtyLabel}</span>
          <span style={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798', textAlign: 'right' }}>금액</span>
          <span />
        </div>

        {items.map((it, idx) => (
          <ItemRow
            key={idx} item={it} idx={idx} canRemove={items.length > 1} qtyLabel={qtyLabel}
            settlementMembers={showMemberSplit ? settlementMembers : null}
            onName={(v) => updateItem(idx, { name: v })}
            onQty={(v) => updateItem(idx, { qty: v.replace(/[^0-9]/g, '') })}
            onAmount={(v) => updateItem(idx, { amount: v })}
            onCurrencyChange={(meta) => updateItem(idx, { currencyMeta: meta })}
            onRemove={() => removeItem(idx)}
            onToggleExpand={() => toggleItemExpand(idx)}
            onToggleMember={(mid) => toggleItemMember(idx, mid)}
            onMemberAmount={(mid, v) => setItemMemberAmount(idx, mid, v)}
          />
        ))}

        <button type="button" onClick={addItem} className="rcpt-add-row">+ 행 추가</button>

        <div style={{ display: 'grid', gridTemplateColumns: showMemberSplit ? '1fr 14px 46px 84px 18px' : '1fr 46px 84px 18px', gap: 8, alignItems: 'center', padding: '8px 0 0', marginTop: 6, borderTop: '1px dashed #cfccd4' }}>
          <span style={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798' }}>합계</span>
          {showMemberSplit && <span />}
          <span />
          <span style={{ fontSize: 15.5, fontWeight: 800, color: type === 'expense' ? '#FF4358' : '#2CDDB9', textAlign: 'right' }}>{fmtNum(total)}</span>
          <span />
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="rcpt-dots" />
          <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 400, color: '#a29ead', letterSpacing: '.3px' }}>메모</span>
          <span className="rcpt-dots" style={{ textAlign: 'right' }} />
        </div>
        <textarea
          ref={memoRef} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="추가 설명을 적어주세요" rows={2}
          style={{ marginTop: 8, width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: '#191722', outline: 'none', resize: 'none', padding: 0, overflow: 'hidden' }}
        />
      </div>

      {error && <p className="error" style={{ marginTop: 14 }}>{error}</p>}
      <button className="btn-ink-pill" style={{ marginTop: 26 }} disabled={busy}>{busy ? '저장 중…' : editing ? '수정' : '저장'}</button>
    </form>
  );
});

export default TransactionForm;
