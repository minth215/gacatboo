import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import Modal from '../components/Modal.jsx';

const CATS = ['여행', '구독', '동거', 'N빵', '기타'];
const CAT_ICON = { 여행: '✈️', 구독: '🔁', 동거: '🏠', 'N빵': '🍕', 기타: '📦' };

export default function Groups() {
  const nav = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category: '여행' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/groups').then((d) => setGroups(d.groups)).catch(() => setGroups([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('그룹명을 입력하세요.');
    try {
      const d = await api.post('/groups', form);
      setModal(false);
      setForm({ name: '', description: '', category: '여행' });
      nav(`/groups/${d.id}`);
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <div className="between" style={{ margin: '4px 2px 14px' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>그룹</h2>
        <button className="btn primary sm" onClick={() => setModal(true)}>＋ 그룹 만들기</button>
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
                <span style={{ fontSize: 26 }}>{CAT_ICON[g.category] || '📦'}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{g.name}</div>
                  <div className="small muted">{g.description || '설명 없음'}</div>
                </div>
              </div>
              <span className="chip gray">{g.category}</span>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              총무 {g.owner_name} · 멤버 {g.member_count}명
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
              <label>카테고리</label>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {CATS.map((c) => (
                  <button type="button" key={c} className={`chip ${form.category === c ? '' : 'gray'}`}
                    onClick={() => setForm({ ...form, category: c })} style={{ border: 'none' }}>
                    {CAT_ICON[c]} {c}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn block" onClick={() => setModal(false)}>취소</button>
              <button className="btn primary block">만들기</button>
            </div>
            <p className="small muted center" style={{ marginTop: 10 }}>그룹을 만들면 내가 총무가 됩니다.</p>
          </form>
        </Modal>
      )}
    </div>
  );
}
