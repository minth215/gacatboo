import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';

export default function SourceManage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [newTop, setNewTop] = useState('');
  const [childInputs, setChildInputs] = useState({});

  const load = useCallback(() => db.listSources().then(({ tree }) => setSources(tree)).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const wrap = (p) => p.catch((e) => alert(e.message));

  const addTop = async () => {
    if (!newTop.trim()) return;
    await wrap(db.addSource(user.id, newTop.trim(), null)); setNewTop(''); load();
  };
  const addChild = async (parentId) => {
    const val = (childInputs[parentId] || '').trim();
    if (!val) return;
    await wrap(db.addSource(user.id, val, parentId));
    setChildInputs({ ...childInputs, [parentId]: '' }); load();
  };
  const editSrc = async (s) => {
    const name = prompt('원천 이름', s.name);
    if (name && name.trim() && name !== s.name) { await wrap(db.updateSource(s.id, name.trim())); load(); }
  };
  const delSrc = async (s) => {
    if (!confirm(`'${s.name}'${s.children?.length ? ' 및 하위 항목' : ''}을(를) 삭제할까요?`)) return;
    await wrap(db.deleteSource(s.id)); load();
  };

  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav('/settings')} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 설정</button>
      <h2 style={{ margin: '4px 2px 4px', fontSize: 20 }}>원천 관리</h2>
      <p className="small muted" style={{ margin: '0 2px 14px' }}>
        카테고리(현금/은행/카드/기타) 안에 세부 항목(우리은행, 삼성카드 등)을 추가할 수 있습니다.
      </p>

      <div className="card">
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
