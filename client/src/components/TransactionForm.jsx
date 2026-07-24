import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, fmtWon } from '../lib/format.js';

// 분류/원천에 id 는 없고 이름(스냅샷)만 있는 항목(그룹 자동기입 등)을 표시하기 위한 센티넬
const SNAP = '__snap__';

// 수입/지출 항목 작성·수정 폼. groupId 지정 시 그룹 항목으로 저장.
export default function TransactionForm({ initial, groupId, onSaved, onClose }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const editing = !!initial?.id;
  const [type, setType] = useState(initial?.type || 'expense');
  const [date, setDate] = useState(initial?.date || today());
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [categoryId, setCategoryId] = useState(
    initial?.category_id ? String(initial.category_id) : (initial?.category_name ? SNAP : '')
  );
  const [sourceId, setSourceId] = useState(
    initial?.source_id ? String(initial.source_id) : (initial?.source_name ? SNAP : '')
  );
  const [content, setContent] = useState(initial?.content || '');
  const [memo, setMemo] = useState(initial?.memo || '');
  const [settlementTargetId, setSettlementTargetId] = useState(initial?.settlement_target_id ? String(initial.settlement_target_id) : '');

  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [sourcesFlat, setSourcesFlat] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [contentSuggestions, setContentSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.listCategories().then(setCategories).catch(() => {});
    db.listSources().then(({ tree, flat }) => { setSources(tree); setSourcesFlat(flat); }).catch(() => {});
    db.listRecentExpenses(user.id, { includeId: initial?.settlement_target_id || null }).then(setRecentExpenses).catch(() => {});
    db.listContentSuggestions(user.id).then(setContentSuggestions).catch(() => {});
  }, []);

  const catOptions = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const selCategory = categories.find((c) => String(c.id) === String(categoryId));
  const isSettlement = type === 'income' && selCategory?.name === '정산';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) < 0) return setError('금액을 입력하세요.');
    setBusy(true);

    // 분류 결정 (SNAP=기존 스냅샷 유지 / 실제 선택 / 선택 안 함)
    let category_id = null, category_name = '', category_emoji = '';
    if (categoryId === SNAP) {
      category_name = initial?.category_name || '';
      category_emoji = initial?.category_emoji || '';
    } else if (categoryId) {
      const c = categories.find((x) => String(x.id) === String(categoryId));
      if (c) { category_id = Number(c.id); category_name = c.name; category_emoji = c.emoji || ''; }
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
      category_id, category_name, category_emoji,
      source_id, source_name,
      content, memo,
      settlement_target_id: (isSettlement && settlementTargetId) ? Number(settlementTargetId) : null,
      group_id: groupId || null,
    };
    try {
      await db.saveTransaction({ id: initial?.id, userId: user.id, payload, sourcesFlat });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="center" style={{ marginBottom: 16 }}>
        <div className="pill-toggle">
          <button type="button" className={`income ${type === 'income' ? 'active' : ''}`} onClick={() => { setType('income'); setCategoryId(''); }}>수입</button>
          <button type="button" className={`expense ${type === 'expense' ? 'active' : ''}`} onClick={() => { setType('expense'); setCategoryId(''); }}>지출</button>
        </div>
      </div>

      <div className="field">
        <label>금액</label>
        <div className="with-suffix">
          <input type="number" inputMode="numeric" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
          <span className="suffix">원</span>
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label>날짜</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
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
      <div className="row" style={{ marginTop: 6 }}>
        <button type="button" className="btn block" onClick={onClose}>취소</button>
        <button className="btn primary block" disabled={busy}>{busy ? '저장 중…' : editing ? '수정' : '저장'}</button>
      </div>
    </form>
  );
}
