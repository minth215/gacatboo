import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { useDragReorder } from '../lib/useDragReorder.js';
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
  const [editMode, setEditMode] = useState(false); // 정렬 수정 모드
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => db.listNotificationTemplates().then(setTemplates).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setErr(''); setEditing({ ...emptyTemplate }); };
  const openEdit = (t) => { if (editMode) return; setErr(''); setEditing({ ...t }); };

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
    try { await db.deleteNotificationTemplate(t.id); setEditing(null); load(); } catch (e) { alert(e.message); }
  };

  const { dragId, setRowRef, startDrag } = useDragReorder(templates, setTemplates, async (ids) => {
    try { await db.reorderNotificationTemplates(ids); } catch (e) { alert(e.message); load(); }
  });

  return (
    <>
      <p className="small muted" style={{ marginTop: 14 }}>
        제목·본문에 <code>{'{{group_name}}'}</code> 처럼 이중 중괄호로 변수를 넣을 수 있습니다(코드에서 해당 상황에 맞는 값을 채워 보냅니다).
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 2px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#191722' }}>알림 메시지</span>
          <span className="chip">{templates.length}</span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span className="small muted">정렬 수정</span>
          <button type="button" role="switch" aria-checked={editMode} aria-label="정렬 수정"
            className={`ios-toggle${editMode ? ' on' : ''}`} onClick={() => setEditMode((v) => !v)}>
            <span className="ios-toggle-knob" />
          </button>
        </label>
      </div>

      {templates.length === 0 ? (
        <div className="empty empty-center">등록된 알림 템플릿이 없습니다.</div>
      ) : (
        <div className="ntpl-list">
          {templates.map((t) => (
            <button key={t.id} ref={setRowRef(t.id)} type="button" className="ntpl-card"
              onClick={() => openEdit(t)}
              style={{ cursor: editMode ? 'default' : 'pointer', opacity: dragId === t.id ? 0.4 : t.active ? 1 : 0.5 }}>
              <span
                className={`ntpl-emoji${editMode ? ' draggable' : ''}${dragId === t.id ? ' dragging' : ''}`}
                style={{ background: t.color || '#f4f2f0' }}
                onPointerDown={editMode ? startDrag(t.id) : undefined}
              >
                {t.emoji || '🔔'}
              </span>
              <span className="ntpl-main">
                <span className="ntpl-title">{t.title_template || '(제목 없음)'}</span>
                <span className="ntpl-body">{t.body_template}{!t.active && ' · 비활성'}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!editMode && (
        <button className="fab" onClick={openNew} aria-label="템플릿 추가">＋</button>
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
            {editing.id && (
              <button type="button" onClick={() => remove(editing)} style={{ display: 'block', margin: '12px auto 0', border: 'none', background: 'transparent', color: 'var(--expense)', fontSize: 12.5, fontWeight: 700, padding: '6px 10px', cursor: 'pointer' }}>템플릿 삭제</button>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
