import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';

export default function Settings() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [catType, setCatType] = useState('expense');
  const [newCat, setNewCat] = useState('');
  const [newTop, setNewTop] = useState('');
  const [childInputs, setChildInputs] = useState({}); // {parentId: value}

  const loadCats = useCallback(() => db.listCategories().then(setCategories), []);
  const loadSrcs = useCallback(() => db.listSources().then(({ tree }) => setSources(tree)), []);

  useEffect(() => { loadCats(); loadSrcs(); }, [loadCats, loadSrcs]);

  const wrap = (fn) => fn.catch((e) => alert(e.message));

  const addCat = async () => {
    if (!newCat.trim()) return;
    await wrap(db.addCategory(user.id, catType, newCat.trim())); setNewCat(''); loadCats();
  };
  const editCat = async (c) => {
    const name = prompt('분류 이름', c.name);
    if (name && name.trim() && name !== c.name) { await wrap(db.updateCategory(c.id, name.trim())); loadCats(); }
  };
  const delCat = async (c) => {
    if (!confirm(`'${c.name}' 분류를 삭제할까요?`)) return;
    await wrap(db.deleteCategory(c.id)); loadCats();
  };

  const addTop = async () => {
    if (!newTop.trim()) return;
    await wrap(db.addSource(user.id, newTop.trim(), null)); setNewTop(''); loadSrcs();
  };
  const addChild = async (parentId) => {
    const val = (childInputs[parentId] || '').trim();
    if (!val) return;
    await wrap(db.addSource(user.id, val, parentId));
    setChildInputs({ ...childInputs, [parentId]: '' }); loadSrcs();
  };
  const editSrc = async (s) => {
    const name = prompt('원천 이름', s.name);
    if (name && name.trim() && name !== s.name) { await wrap(db.updateSource(s.id, name.trim())); loadSrcs(); }
  };
  const delSrc = async (s) => {
    if (!confirm(`'${s.name}'${s.children?.length ? ' 및 하위 항목' : ''}을(를) 삭제할까요?`)) return;
    await wrap(db.deleteSource(s.id)); loadSrcs();
  };

  const shownCats = categories.filter((c) => c.type === catType);

  return (
    <div>
      <h2 style={{ margin: '4px 2px 14px', fontSize: 20 }}>설정</h2>

      {/* 분류 관리 */}
      <div className="card">
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>분류 관리</h3>
          <div className="pill-toggle">
            <button className={catType === 'income' ? 'income active' : ''} onClick={() => setCatType('income')}>수입</button>
            <button className={catType === 'expense' ? 'expense active' : ''} onClick={() => setCatType('expense')}>지출</button>
          </div>
        </div>
        {shownCats.map((c) => (
          <div className="list-item" key={c.id}>
            <span className="li-main">{c.name}</span>
            <button className="btn sm ghost" onClick={() => editCat(c)}>수정</button>
            <button className="btn sm ghost" onClick={() => delCat(c)} style={{ color: 'var(--expense)' }}>삭제</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={`새 ${catType === 'income' ? '수입' : '지출'} 분류`}
            onKeyDown={(e) => e.key === 'Enter' && addCat()} style={{ flex: 1, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }} />
          <button className="btn primary" onClick={addCat}>추가</button>
        </div>
      </div>

      {/* 원천 관리 */}
      <div className="card">
        <h3>원천 관리</h3>
        <p className="small muted" style={{ marginTop: -4, marginBottom: 12 }}>
          카테고리(현금/은행/카드/기타) 안에 세부 항목(우리은행, 삼성카드 등)을 추가할 수 있습니다.
        </p>
        {sources.map((top) => (
          <div key={top.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div className="between">
              <strong>{top.name}</strong>
              <div className="row">
                <button className="btn sm ghost" onClick={() => editSrc(top)}>수정</button>
                <button className="btn sm ghost" onClick={() => delSrc(top)} style={{ color: 'var(--expense)' }}>삭제</button>
              </div>
            </div>
            {top.children?.map((c) => (
              <div className="list-item" key={c.id} style={{ paddingLeft: 8 }}>
                <span className="li-main small">↳ {c.name}</span>
                <button className="btn sm ghost" onClick={() => editSrc(c)}>수정</button>
                <button className="btn sm ghost" onClick={() => delSrc(c)} style={{ color: 'var(--expense)' }}>삭제</button>
              </div>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              <input value={childInputs[top.id] || ''} onChange={(e) => setChildInputs({ ...childInputs, [top.id]: e.target.value })}
                placeholder={`${top.name} 세부 항목 추가`} onKeyDown={(e) => e.key === 'Enter' && addChild(top.id)}
                style={{ flex: 1, padding: 9, border: '1px solid var(--line)', borderRadius: 10, fontSize: 14 }} />
              <button className="btn sm" onClick={() => addChild(top.id)}>추가</button>
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <input value={newTop} onChange={(e) => setNewTop(e.target.value)} placeholder="새 원천 카테고리"
            onKeyDown={(e) => e.key === 'Enter' && addTop()} style={{ flex: 1, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }} />
          <button className="btn primary" onClick={addTop}>추가</button>
        </div>
      </div>
    </div>
  );
}
