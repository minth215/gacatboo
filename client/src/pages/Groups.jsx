import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { leaderLabel } from '../lib/format.js';
import Modal from '../components/Modal.jsx';

export default function Groups() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupCats, setGroupCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category: '', category_emoji: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    db.listGroups(user.id).then(setGroups).catch(() => setGroups([])).finally(() => setLoading(false));
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { db.listGroupCategories().then(setGroupCats).catch(() => setGroupCats([])); }, []);

  const openModal = () => {
    const first = groupCats[0];
    setForm({ name: '', description: '', category: first?.name || '기타', category_emoji: first?.emoji || '' });
    setError('');
    setModal(true);
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('그룹명을 입력하세요.');
    try {
      const g = await db.createGroup(user.id, { ...form, name: form.name.trim() });
      setModal(false);
      nav(`/groups/${g.id}`);
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <div className="between" style={{ margin: '4px 2px 14px' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>그룹</h2>
        <button className="btn primary sm" onClick={openModal}>＋ 그룹 만들기</button>
      </div>

      {loading ? (
        <div className="empty">불러오는 중…</div>
      ) : groups.length === 0 ? (
        <div className="empty">아직 참여 중인 그룹이 없습니다.<br />여행·구독·N빵 등을 그룹으로 함께 관리해 보세요.</div>
      ) : (
        groups.map((g) => (
          <div className="card" key={g.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/groups/${g.id}`)}>
            <div className="between">
              <div className="row">
                <span style={{ fontSize: 26 }}>{g.category_emoji || '📦'}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{g.name}</div>
                  <div className="small muted">{g.description || '설명 없음'}</div>
                </div>
              </div>
              <span className="chip gray">{g.category}</span>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              {leaderLabel(g.category)} {g.owner_name} · 멤버 {g.member_count}명
            </div>
          </div>
        ))
      )}

      {modal && (
        <Modal title="그룹 만들기" onClose={() => setModal(false)}>
          <form onSubmit={create}>
            <div className="field">
              <label>그룹명</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 제주도 여행" autoFocus />
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
              {groupCats.length === 0 ? (
                <p className="small muted">카테고리가 없습니다. 우측 상단 편집에서 추가하세요.</p>
              ) : (
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {groupCats.map((c) => (
                    <button type="button" key={c.id}
                      className={`chip ${form.category === c.name ? '' : 'gray'}`}
                      onClick={() => setForm({ ...form, category: c.name, category_emoji: c.emoji })}
                      style={{ border: 'none' }}>
                      {c.emoji} {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn block" onClick={() => setModal(false)}>취소</button>
              <button className="btn primary block">만들기</button>
            </div>
            <p className="small muted center" style={{ marginTop: 10 }}>그룹을 만들면 내가 {leaderLabel(form.category)}가 됩니다.</p>
          </form>
        </Modal>
      )}
    </div>
  );
}
