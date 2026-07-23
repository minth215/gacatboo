import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';

export default function GroupEdit() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [groupCats, setGroupCats] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.getGroup(gid).then(({ group }) => {
      if (group.owner_id !== user.id) { alert('수정 권한이 없습니다.'); nav(`/groups/${gid}`); return; }
      setForm({
        name: group.name, description: group.description || '',
        category: group.category, category_emoji: group.category_emoji || '',
        start_date: group.start_date || '', end_date: group.end_date || '',
      });
    }).catch((e) => { alert(e.message); nav('/groups'); });
    db.listGroupCategories().then(setGroupCats).catch(() => {});
  }, [gid]);

  if (!form) return <div className="empty">불러오는 중…</div>;

  const save = async () => {
    if (!form.name.trim()) return setErr('그룹명을 입력하세요.');
    if (!form.start_date) return setErr('시작일자를 입력하세요.');
    if (form.end_date && form.end_date < form.start_date) return setErr('종료일자는 시작일자 이후여야 합니다.');
    setBusy(true); setErr('');
    try { await db.updateGroup(gid, form); nav(`/groups/${gid}`); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav(`/groups/${gid}`)} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 그룹</button>
      <h2 style={{ margin: '4px 2px 14px', fontSize: 20 }}>그룹 정보 수정</h2>

      <div className="card">
        <div className="field">
          <label>그룹명</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>설명</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="그룹 설명 (선택)" />
        </div>
        <div className="field">
          <div className="field-label-row">
            <label>카테고리</label>
            <button type="button" className="edit-link" onClick={() => nav('/settings/group-categories')}>편집 ›</button>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {groupCats.map((c) => (
              <button type="button" key={c.id}
                className={`chip ${form.category === c.name ? '' : 'gray'}`}
                onClick={() => setForm({ ...form, category: c.name, category_emoji: c.emoji })}
                style={{ border: 'none' }}>
                {c.emoji} {c.name}
              </button>
            ))}
            {!groupCats.some((c) => c.name === form.category) && form.category && (
              <span className="chip">{form.category_emoji} {form.category}</span>
            )}
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>시작일자</label>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div className="field">
            <label>종료일자 <span className="small muted">(선택)</span></label>
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
        </div>
        {form.end_date && <p className="small muted" style={{ marginTop: -4 }}>종료일자를 입력하면 종료된 그룹으로 표시됩니다.</p>}
        {err && <p className="error">{err}</p>}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn block" onClick={() => nav(`/groups/${gid}`)}>취소</button>
          <button className="btn primary block" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}
