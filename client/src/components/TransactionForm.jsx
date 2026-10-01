import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, fmtWon, renderTemplate } from '../lib/format.js';
import { resolveRecurrence } from '../lib/recurrence.js';
import CalcAmountInput from './CalcAmountInput.jsx';
import RecurrenceModal from './RecurrenceModal.jsx';

// "반복 관리" 메뉴와 동일한 반복 아이콘(채워진 순환 화살표)
const RepeatIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={color}>
    <path d="M12,4V1L8,5l4,4V6c3.31,0,6,2.69,6,6c0,1.01-0.25,1.97-0.7,2.8l1.46,1.46C19.54,15.03,20,13.57,20,12C20,7.58,16.42,4,12,4z M6,12c0-1.01,0.25-1.97,0.7-2.8L5.24,7.74C4.46,8.97,4,10.43,4,12c0,4.42,3.58,8,8,8v3l4-4l-4-4v3c-3.31,0-6-2.69-6-6z" />
  </svg>
);

// 분류/원천에 id 는 없고 이름(스냅샷)만 있는 항목(그룹 자동기입 등)을 표시하기 위한 센티넬
const SNAP = '__snap__';

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

// 수입/지출 항목 작성·수정 폼. groupId 지정 시 그룹 항목으로 저장.
// fixedType 지정 시 수입/지출 토글을 숨기고 해당 유형으로 고정(예: 그룹 결제=지출).
// defaultCategoryName 지정 시 신규 작성 때 해당 이름의 분류를 기본 선택.
// defaultAmount 지정 시 신규 작성 때 "금액"을 이 값으로 자동 채움(예: 그룹 결제 → 정기결제금액).
// defaultContentTemplate 지정 시 신규 작성 때 "내용"을 이 템플릿({연}/{월}/{일} 변수 지원)으로 자동 채우고,
// 날짜를 바꾸면 그 날짜 기준으로 다시 채워짐.
// onSubmit 지정 시 db.saveTransaction 대신 이 함수로 저장을 위임(그룹 결제 등 별도 저장 로직).
const TransactionForm = forwardRef(function TransactionForm({ initial, groupId, onSaved, onClose, fixedType, defaultCategoryName, defaultAmount, defaultContentTemplate, onSubmit, topNotice, showPeriods, onScanBusyChange, initialPendingRecurrence }, ref) {
  const { user } = useAuth();
  const nav = useNavigate();
  const editing = !!initial?.id;
  const [type, setType] = useState(fixedType || initial?.type || 'expense');
  const [date, setDate] = useState(initial?.date || today());
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [periods, setPeriods] = useState(initial?.periods ? String(initial.periods) : '1');
  const [categoryId, setCategoryId] = useState(
    initial?.category_id ? String(initial.category_id) : (initial?.category_name ? SNAP : '')
  );
  const [sourceId, setSourceId] = useState(
    initial?.source_id ? String(initial.source_id) : (initial?.source_name ? SNAP : '')
  );
  const [content, setContent] = useState(initial?.content || '');
  const [memo, setMemo] = useState(initial?.memo || '');
  const [settlementTargetId, setSettlementTargetId] = useState(initial?.settlement_target_id ? String(initial.settlement_target_id) : '');
  // 외화로 입력했을 때의 원본 통화·금액·환율 스냅샷(원화로 입력했으면 null). CalcAmountInput 이 관리.
  const [currencyMeta, setCurrencyMeta] = useState(
    initial?.input_currency ? { input_currency: initial.input_currency, input_amount: initial.input_amount, fx_rate: initial.fx_rate } : null
  );
  // 반복 설정: 이미 저장된 반복(recurringId)이거나, 아직 저장 전인 선택값(pendingRecurrence) 중 하나만 있을 수 있음
  const [recurringId, setRecurringId] = useState(initial?.recurring?.id || null);
  const [recurringLabel, setRecurringLabel] = useState(initial?.recurring?.label || '');
  const [pendingRecurrence, setPendingRecurrence] = useState(initialPendingRecurrence || null);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);

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
    if (!editing && !content && defaultContentTemplate) setContent(renderTemplate(defaultContentTemplate, date));
  }, [defaultContentTemplate]);

  // 신규 작성 시 "금액" 기본값 적용(비동기로 나중에 도착해도 반영)
  useEffect(() => {
    if (!editing && !amount && defaultAmount) setAmount(String(defaultAmount));
  }, [defaultAmount]);

  // 신규 작성 시 원천 기본값: 지출은 주결제수단, 수입은 주입금수단(원천 관리에서 지정한 것)
  useEffect(() => {
    if (editing || sourceId) return;
    const key = type === 'expense' ? 'is_primary_payment' : 'is_primary_deposit';
    const s = sourcesFlat.find((x) => x[key]);
    if (s) setSourceId(String(s.id));
  }, [editing, type, sourcesFlat]);

  const onDateChange = (v) => {
    setDate(v);
    if (!editing && defaultContentTemplate) setContent(renderTemplate(defaultContentTemplate, v));
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

  // 금액 입력 시 정기결제금액(defaultAmount) 대비 회차 자동 계산(직접 수정도 가능)
  const onAmountChange = (v) => {
    const amt = v.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    setAmount(amt);
    if (showPeriods && defaultAmount > 0 && amt) {
      setPeriods(String(Math.round(Number(amt) / defaultAmount)));
    }
  };

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
      if (result.amount) onAmountChange(String(result.amount));
      if (result.merchant) setContent(result.merchant);
      if (result.category) {
        const c = categories.find((x) => x.type === 'expense' && x.name === result.category);
        if (c) setCategoryId(String(c.id));
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

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) < 0) return setError('금액을 입력하세요.');
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

    const payload = {
      type, date, amount: Math.round(Number(amount)),
      category_id, category_name, category_emoji, category_color,
      source_id, source_name,
      content, memo,
      input_currency: currencyMeta?.input_currency || null,
      input_amount: currencyMeta?.input_amount ?? null,
      fx_rate: currencyMeta?.fx_rate ?? null,
      recurrence: (!recurringId && pendingRecurrence) ? resolveRecurrence(pendingRecurrence, date) : null,
      settlement_target_id: (isSettlement && settlementTargetId) ? Number(settlementTargetId) : null,
      group_id: groupId || null,
      ...(showPeriods ? { periods: Math.max(Number(periods) || 1, 1) } : {}),
    };
    try {
      if (onSubmit) await onSubmit(payload);
      else await db.saveTransaction({ id: initial?.id, userId: user.id, payload, sourcesFlat });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {topNotice}

      {!editing && !fixedType && (
        <>
          <input
            ref={receiptInputRef} type="file" accept="image/*" capture="environment"
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

      <div className="field">
        <label>날짜</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} style={{ flex: 1 }} />
          <button
            type="button" onClick={onRecurrenceIconClick} aria-label="반복 설정"
            style={{
              width: 42, height: 42, borderRadius: 10, border: 'none', flex: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: (recurringId || pendingRecurrence) ? (type === 'income' ? '#E5FBF6' : '#FFE9EF') : '#f4f2f0',
            }}
          >
            <RepeatIcon color={!(recurringId || pendingRecurrence) ? '#c7c3cc' : (type === 'income' ? '#2CDDB9' : '#FF6F91')} />
          </button>
        </div>
      </div>

      {showRecurrenceModal && (
        <RecurrenceModal onClose={() => setShowRecurrenceModal(false)} onSelect={(p) => { setPendingRecurrence(p); setShowRecurrenceModal(false); }} />
      )}

      {showPeriods ? (
        <div className="grid2">
          <div className="field">
            <label>금액</label>
            <CalcAmountInput
              value={amount} onChange={onAmountChange} autoFocus
              initialCurrency={currencyMeta?.input_currency} initialForeignAmount={currencyMeta?.input_amount}
              onCurrencyChange={setCurrencyMeta}
            />
          </div>
          <div className="field">
            <label>기간(회차)</label>
            <input type="number" min="1" value={periods} onChange={(e) => setPeriods(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="field">
          <label>금액</label>
          <CalcAmountInput
            value={amount} onChange={onAmountChange} autoFocus
            initialCurrency={currencyMeta?.input_currency} initialForeignAmount={currencyMeta?.input_amount}
            onCurrencyChange={setCurrencyMeta}
          />
        </div>
      )}

      <div className="field">
        <div className="field-label-row">
          <label>분류</label>
          <button type="button" className="edit-link" onClick={() => nav(`/settings/categories/${type}`)}>편집 ›</button>
        </div>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">선택 안 함</option>
          {categoryId === SNAP && (
            <option value={SNAP}>{initial?.category_emoji ? `${initial.category_emoji} ` : ''}{initial?.category_name} (기존)</option>
          )}
          {catOptions.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
        </select>
      </div>

      <div className="field">
        <div className="field-label-row">
          <label>원천</label>
          <button type="button" className="edit-link" onClick={() => nav('/settings/sources')}>편집 ›</button>
        </div>
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
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
        <div className="field">
          <label>정산 대상 <span className="small muted">(정산할 지출 선택)</span></label>
          <select value={settlementTargetId} onChange={(e) => setSettlementTargetId(e.target.value)}>
            <option value="">선택 안 함</option>
            {recentExpenses.map((x) => (
              <option key={x.id} value={x.id}>
                {x.date.slice(5)} {x.category_emoji || ''} {x.content || x.category_name || '지출'} ({fmtWon(x.amount)})
              </option>
            ))}
          </select>
          <p className="small muted" style={{ margin: '4px 2px 0' }}>선택한 지출에서 이 금액만큼 차감되고, 이 수입은 통계에서 제외됩니다.</p>
        </div>
      )}

      <div className="field">
        <label>내용</label>
        <input list="tx-content-list" value={content} onChange={(e) => setContent(e.target.value)} placeholder="가계부에 표시될 내용" autoComplete="off" />
        <datalist id="tx-content-list">
          {contentSuggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>

      <div className="field">
        <label>메모</label>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="추가 설명 (선택)" />
      </div>

      {error && <p className="error">{error}</p>}
      <button className="btn-ink-pill" disabled={busy}>{busy ? '저장 중…' : editing ? '수정' : '저장'}</button>
    </form>
  );
});

export default TransactionForm;
