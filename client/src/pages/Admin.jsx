import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import Modal from '../components/Modal.jsx';

const STATUS_LABEL = { approved: '승인됨', pending: '대기중', rejected: '거부됨' };

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ username: '', display_name: '', password: '', role: 'user' });
  const [err, setErr] = useState('');

  const load = useCallback(() => api.get('/admin/users').then((d) => setUsers(d.users)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (u, status) => { await api.patch(`/admin/users/${u.id}/status`, { status }); load(); };
  const setRole = async (u, role) => {
    try { await api.patch(`/admin/users/${u.id}/role`, { role }); load(); } catch (e) { alert(e.message); }
  };
  const remove = async (u) => {
    if (!confirm(`${u.display_name}(@${u.username}) 계정을 삭제할까요?`)) return;
    try { await api.del(`/admin/users/${u.id}`); load(); } catch (e) { alert(e.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.post('/admin/users', form);
      setModal(false); setForm({ username: '', display_name: '', password: '', role: 'user' }); load();
    } catch (e2) { setErr(e2.message); }
  };

  const pending = users.filter((u) => u.status === 'pending');

  return (
    <div>
      <div className="between" style={{ margin: '4px 2px 14px' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>회원 관리</h2>
        <button className="btn primary sm" onClick={() => setModal(true)}>＋ 계정 생성</button>
      </div>

      {pending.length > 0 && (
        <div className="card" style={{ borderColor: '#ffe0b2', background: '#fffdf8' }}>
          <h3>승인 대기 ({pending.length})</h3>
          {pending.map((u) => (
            <div className="list-item" key={u.id}>
              <div className="li-main">
                <div style={{ fontWeight: 600 }}>{u.display_name}</div>
                <div className="small muted">@{u.username}</div>
              </div>
              <button className="btn sm primary" onClick={() => setStatus(u, 'approved')}>승인</button>
              <button className="btn sm danger" onClick={() => setStatus(u, 'rejected')}>거부</button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>전체 회원 ({users.length})</h3>
        {users.map((u) => (
          <div className="list-item" key={u.id}>
            <div className="li-main">
              <div style={{ fontWeight: 600 }}>
                {u.display_name}
                {u.role === 'admin' && <span className="badge admin" style={{ marginLeft: 6 }}>관리자</span>}
              </div>
              <div className="small muted">@{u.username} · <span className={`badge ${u.status}`}>{STATUS_LABEL[u.status]}</span></div>
            </div>
            {u.id !== user.id && (
              <div className="row">
                {u.status !== 'approved' && <button className="btn sm ghost" onClick={() => setStatus(u, 'approved')}>승인</button>}
                {u.status === 'approved' && <button className="btn sm ghost" onClick={() => setStatus(u, 'rejected')}>차단</button>}
                <button className="btn sm ghost" onClick={() => setRole(u, u.role === 'admin' ? 'user' : 'admin')}>
                  {u.role === 'admin' ? '관리자 해제' : '관리자 지정'}
                </button>
                <button className="btn sm ghost" style={{ color: 'var(--expense)' }} onClick={() => remove(u)}>삭제</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="계정 생성" onClose={() => setModal(false)}>
          <form onSubmit={create}>
            <div className="field"><label>아이디</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus /></div>
            <div className="field"><label>이름</label>
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
            <div className="field"><label>비밀번호</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div className="field"><label>역할</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="user">일반 사용자</option>
                <option value="admin">관리자</option>
              </select></div>
            {err && <p className="error">{err}</p>}
            <div className="row" style={{ marginTop: 6 }}>
              <button type="button" className="btn block" onClick={() => setModal(false)}>취소</button>
              <button className="btn primary block">생성 (즉시 승인)</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
