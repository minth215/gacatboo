import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';

const STATUS_LABEL = { approved: '승인됨', pending: '대기중', rejected: '거부됨' };

export default function Admin() {
  const [tab, setTab] = useState('members'); // members | notifications

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="관리자" />

      <div className="underline-tabs" style={{ marginTop: 4 }}>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>회원 관리</button>
        <button className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}>알림 관리</button>
      </div>

      {tab === 'members' ? <AdminMembers /> : <AdminNotifications />}
    </div>
  );
}

function AdminMembers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ email: '', username: '', display_name: '', password: '', role: 'user' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => db.listUsers().then(setUsers).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (u, status) => { try { await db.setUserStatus(u.id, status); load(); } catch (e) { alert(e.message); } };
  const setRole = async (u, role) => {
    if (u.role === 'admin' && role === 'user' && users.filter((x) => x.role === 'admin').length <= 1) {
      return alert('최소 한 명의 관리자가 필요합니다.');
    }
    try { await db.setUserRole(u.id, role); load(); } catch (e) { alert(e.message); }
  };
  const remove = async (u) => {
    if (!confirm(`${u.display_name}(@${u.username}) 계정을 삭제할까요?`)) return;
    try { await db.deleteUser(u.id); load(); } catch (e) { alert(e.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await db.createUser(form);
      setModal(false); setForm({ email: '', username: '', display_name: '', password: '', role: 'user' }); load();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  const pending = users.filter((u) => u.status === 'pending');

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
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
            <div className="field"><label>이메일</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus /></div>
            <div className="field"><label>아이디</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
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
            <p className="small muted">계정 생성은 Edge Function(<code>admin</code>)이 배포되어 있어야 동작합니다.</p>
            <div className="row" style={{ marginTop: 6 }}>
              <button type="button" className="btn block" onClick={() => setModal(false)}>취소</button>
              <button className="btn primary block" disabled={busy}>{busy ? '생성 중…' : '생성 (즉시 승인)'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

const emptyTemplate = { event_key: '', title_template: '', body_template: '', emoji: '🔔', color: '#FFE9EF', active: true };

function AdminNotifications() {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // null | 템플릿 객체(새 템플릿이면 id 없음)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => db.listNotificationTemplates().then(setTemplates).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setErr(''); setEditing({ ...emptyTemplate }); };
  const openEdit = (t) => { setErr(''); setEditing({ ...t }); };

  const save = async (e) => {
    e.preventDefault();
    if (!editing.event_key.trim()) return setErr('상황 키(event_key)를 입력하세요.');
    setBusy(true); setErr('');
    try {
      await db.upsertNotificationTemplate(editing);
      setEditing(null); load();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  const remove = async (t) => {
    if (!confirm(`'${t.title_template || t.event_key}' 템플릿을 삭제할까요? 해당 상황의 알림이 더 이상 생성되지 않습니다.`)) return;
    try { await db.deleteNotificationTemplate(t.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <>
      <p className="small muted" style={{ marginTop: 14 }}>
        제목·본문에 <code>{'{{group_name}}'}</code> 처럼 이중 중괄호로 변수를 넣을 수 있습니다(코드에서 해당 상황에 맞는 값을 채워 보냅니다).
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn primary sm" onClick={openNew}>＋ 템플릿 추가</button>
      </div>

      {templates.length === 0 ? (
        <div className="empty empty-center">등록된 알림 템플릿이 없습니다.</div>
      ) : (
        <div className="tx-daycard">
          {templates.map((t, i) => (
            <div key={t.id} onClick={() => openEdit(t)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
              borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5', opacity: t.active ? 1 : 0.5,
            }}>
              <span style={{ width: 36, height: 36, borderRadius: 11, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, background: t.color || '#f4f2f0' }}>
                {t.emoji || '🔔'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{t.title_template || '(제목 없음)'}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#a29ead', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.event_key} · {t.body_template}{!t.active && ' · 비활성'}
                </div>
              </div>
              <button aria-label="템플릿 삭제" onClick={(e) => { e.stopPropagation(); remove(t); }} className="cat-del-btn">
                <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? '템플릿 수정' : '템플릿 추가'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="field"><label>상황 키 (event_key)</label>
              <input value={editing.event_key} onChange={(e) => setEditing({ ...editing, event_key: e.target.value.trim() })}
                placeholder="예: group_invite" disabled={!!editing.id} autoFocus={!editing.id} />
            </div>
            <div className="field"><label>제목</label>
              <input value={editing.title_template} onChange={(e) => setEditing({ ...editing, title_template: e.target.value })} /></div>
            <div className="field"><label>본문</label>
              <textarea rows={3} value={editing.body_template} onChange={(e) => setEditing({ ...editing, body_template: e.target.value })} /></div>
            <div className="grid2">
              <div className="field"><label>이모지</label>
                <input value={editing.emoji} maxLength={4} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} /></div>
              <div className="field"><label>배경 색</label>
                <input type="color" value={editing.color || '#FFE9EF'} onChange={(e) => setEditing({ ...editing, color: e.target.value })} style={{ height: 42, padding: 4 }} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              <span className="small">활성(켜져 있어야 실제로 알림이 생성됩니다)</span>
            </label>
            {err && <p className="error">{err}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn block" onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary block" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
