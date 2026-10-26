import { useEffect, useState } from 'react';
import { db } from '../lib/db.js';
import { today } from '../lib/format.js';

const FIELD_TITLE = {
  content: '내용 일괄 수정', date: '날짜 일괄 수정', category: '분류 일괄 수정', source: '원천 일괄 수정',
};

// 가계부 선택 모드에서 고른 항목들의 내용/날짜/분류/원천을 한 번에 같은 값으로 바꾸는 모달.
// field 에 따라 입력 UI만 다르고, 확인을 누르면 onApply(patch) 로 바뀔 값을 넘긴다.
export default function BulkEditModal({ field, count, onClose, onApply }) {
  const [content, setContent] = useState('');
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (field === 'category') db.listCategories().then(setCategories).catch(() => {});
    if (field === 'source') db.listSources().then(({ tree }) => setSources(tree)).catch(() => {});
  }, [field]);

  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats = categories.filter((c) => c.type === 'income');

  const confirm = async () => {
    setError('');
    let patch = null;
    if (field === 'content') {
      if (!content.trim()) return setError('내용을 입력하세요.');
      patch = { content: content.trim() };
    } else if (field === 'date') {
      patch = { date };
    } else if (field === 'category') {
      if (!categoryId) return setError('분류를 선택하세요.');
      const c = categories.find((x) => String(x.id) === categoryId);
      if (!c) return setError('분류를 선택하세요.');
      patch = { category_id: c.id, category_name: c.name, category_emoji: c.emoji || '', category_color: c.color || '' };
    } else if (field === 'source') {
      if (!sourceId) return setError('원천을 선택하세요.');
      const flat = sources.flatMap((top) => [top, ...(top.children || [])]);
      const s = flat.find((x) => String(x.id) === sourceId);
      if (!s) return setError('원천을 선택하세요.');
      patch = { source_id: s.id, source_name: s.name };
    }
    if (!patch) return;
    setBusy(true);
    try {
      await onApply(patch);
    } catch (e) {
      setError(e.message || '수정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="catmodal-overlay" onClick={onClose}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{FIELD_TITLE[field]}</div>
          <button aria-label="닫기" onClick={onClose} className="catmodal-icon-btn">
            <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
          </button>
        </div>

        <p className="small muted" style={{ margin: 0 }}>선택한 {count}건에 모두 같은 값이 적용됩니다.</p>

        {field === 'content' && (
          <input
            type="text" autoFocus value={content} onChange={(e) => setContent(e.target.value)} placeholder="내용"
            style={{ width: '100%', border: '1px solid var(--k-bd-e4e2e6)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, color: 'var(--k-tx-191722)' }}
          />
        )}
        {field === 'date' && (
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ width: '100%', border: '1px solid var(--k-bd-e4e2e6)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, color: 'var(--k-tx-191722)' }}
          />
        )}
        {field === 'category' && (
          <select
            value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            style={{ width: '100%', border: '1px solid var(--k-bd-e4e2e6)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, color: 'var(--k-tx-191722)', background: 'var(--k-bg-fff)' }}
          >
            <option value="">분류 선택</option>
            {expenseCats.length > 0 && (
              <optgroup label="지출">
                {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
              </optgroup>
            )}
            {incomeCats.length > 0 && (
              <optgroup label="수입">
                {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
              </optgroup>
            )}
          </select>
        )}
        {field === 'source' && (
          <select
            value={sourceId} onChange={(e) => setSourceId(e.target.value)}
            style={{ width: '100%', border: '1px solid var(--k-bd-e4e2e6)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, color: 'var(--k-tx-191722)', background: 'var(--k-bg-fff)' }}
          >
            <option value="">원천 선택</option>
            {sources.map((top) => (
              top.children?.length ? (
                <optgroup key={top.id} label={top.name}>
                  {String(sourceId) === String(top.id) && <option value={top.id}>{top.name}</option>}
                  {top.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ) : (
                <option key={top.id} value={top.id}>{top.name}</option>
              )
            ))}
          </select>
        )}

        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button type="button" className="btn-ink-pill" style={{ flex: 1, marginTop: 0 }} onClick={confirm} disabled={busy}>
            {busy ? '적용 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}
