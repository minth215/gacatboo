import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { today } from '../lib/format.js';

// 수입/지출 항목 작성·수정 폼. groupId 지정 시 그룹 항목으로 저장.
export default function TransactionForm({ initial, groupId, onSaved, onClose }) {
  const editing = !!initial?.id;
  const [type, setType] = useState(initial?.type || 'expense');
  const [date, setDate] = useState(initial?.date || today());
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ? String(initial.category_id) : '');
  const [sourceId, setSourceId] = useState(initial?.source_id ? String(initial.source_id) : '');
  const [content, setContent] = useState(initial?.content || '');
  const [memo, setMemo] = useState(initial?.memo || '');

  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/categories').then((d) => setCategories(d.categories)).catch(() => {});
    api.get('/sources').then((d) => setSources(d.sources)).catch(() => {});
  }, []);

  const catOptions = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) < 0) return setError('금액을 입력하세요.');
    setBusy(true);
    const payload = {
      type, date, amount: Number(amount),
      category_id: categoryId ? Number(categoryId) : null,
      source_id: sourceId ? Number(sourceId) : null,
      content, memo,
    };
    try {
      if (editing) {
        await api.put(`/transactions/${initial.id}`, payload);
      } else {
        await api.post('/transactions', { ...payload, group_id: groupId || null });
      }
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
          <label>분류</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">선택 안 함</option>
            {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>원천</label>
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">선택 안 함</option>
          {sources.map((top) => (
            top.children?.length ? (
              <optgroup key={top.id} label={top.name}>
                <option value={top.id}>{top.name} (전체)</option>
                {top.children.map((c) => <option key={c.id} value={c.id}>{top.name} &gt; {c.name}</option>)}
              </optgroup>
            ) : (
              <option key={top.id} value={top.id}>{top.name}</option>
            )
          ))}
        </select>
      </div>

      <div className="field">
        <label>내용</label>
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="가계부에 표시될 내용" />
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
