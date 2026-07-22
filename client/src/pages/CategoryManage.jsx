import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';

export default function CategoryManage() {
  const { type } = useParams(); // income | expense
  const nav = useNavigate();
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState('');

  const kind = type === 'income' ? '수입' : '지출';
  const valid = type === 'income' || type === 'expense';

  const load = useCallback(() => {
    if (!valid) return;
    db.listCategories(type).then(setCategories).catch((e) => alert(e.message));
  }, [type, valid]);
  useEffect(() => { load(); }, [load]);

  const wrap = (p) => p.catch((e) => alert(e.message));

  const add = async () => {
    if (!newCat.trim()) return;
    await wrap(db.addCategory(user.id, type, newCat.trim())); setNewCat(''); load();
  };
  const edit = async (c) => {
    const name = prompt('분류 이름', c.name);
    if (name && name.trim() && name !== c.name) { await wrap(db.updateCategory(c.id, name.trim())); load(); }
  };
  const del = async (c) => {
    if (!confirm(`'${c.name}' 분류를 삭제할까요?`)) return;
    await wrap(db.deleteCategory(c.id)); load();
  };

  if (!valid) return <div className="empty">잘못된 접근입니다.</div>;

  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav('/settings')} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 설정</button>
      <h2 style={{ margin: '4px 2px 14px', fontSize: 20 }}>{kind} 분류 관리</h2>

      <div className="card">
        {categories.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}>분류가 없습니다.</div>
        ) : categories.map((c) => (
          <div className="list-item" key={c.id}>
            <span className="li-main">{c.name}</span>
            <button className="btn sm ghost" onClick={() => edit(c)}>수정</button>
            <button className="btn sm ghost" onClick={() => del(c)} style={{ color: 'var(--expense)' }}>삭제</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={`새 ${kind} 분류`}
            onKeyDown={(e) => e.key === 'Enter' && add()} style={{ flex: 1, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }} />
          <button className="btn primary" onClick={add}>추가</button>
        </div>
      </div>
    </div>
  );
}
