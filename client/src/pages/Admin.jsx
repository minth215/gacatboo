import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useDragReorder } from '../lib/useDragReorder.js';
import { currentMonth, shiftMonth, today } from '../lib/format.js';
import Modal from '../components/Modal.jsx';

const roundBtn = (size = 36) => ({
  width: size, height: size, borderRadius: '50%', border: 'none', background: '#fff',
  boxShadow: '0 3px 12px rgba(25,23,34,.1)', cursor: 'pointer', color: '#6c6779',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none',
});

const Chevron = () => (
  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#c7c3cc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export default function Admin() {
  const [tab, setTab] = useState('members'); // members | notifications | holidays

  return (
    <div style={{ padding: '32px 0 12px' }}>
      {/* 뒤로가기 헤더 없이 탭이 바로 상단바 역할을 함(최상위 탭 화면이므로 바텀 네비로 벗어남) */}
      <div className="underline-tabs" style={{ top: 0 }}>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>회원 관리</button>
        <button className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}>알림 관리</button>
        <button className={tab === 'holidays' ? 'active' : ''} onClick={() => setTab('holidays')}>공휴일 관리</button>
      </div>

      {tab === 'members' ? <AdminMembers /> : tab === 'notifications' ? <AdminNotifications /> : <AdminHolidays />}
    </div>
  );
}

function AdminMembers() {
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [emails, setEmails] = useState({}); // id -> email
  const [emailErr, setEmailErr] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ email: '', username: '', display_name: '', password: '', role: 'user' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    db.listUsers().then(setUsers).catch((e) => alert(e.message));
    db.listUserEmails().then((rows) => {
      const m = {};
      (rows || []).forEach((r) => { m[r.id] = r.email; });
      setEmails(m);
      setEmailErr('');
    }).catch((e) => setEmailErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (u, status) => { try { await db.setUserStatus(u.id, status); load(); } catch (e) { alert(e.message); } };

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
      {emailErr && (
        <p className="small muted" style={{ marginTop: 14 }}>
          이메일을 불러오지 못했습니다. <code>admin</code> Edge Function을 재배포했는지 확인해 주세요. ({emailErr})
        </p>
      )}

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 2px 10px' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#191722' }}>전체 회원</span>
        <span className="chip">{users.length}</span>
      </div>

      <div className="ntpl-list">
        {users.map((u) => (
          <button key={u.id} type="button" className="ntpl-card ntpl-card-btn" onClick={() => nav(`/admin/users/${u.id}`)}>
            <span className="ntpl-main" style={{ cursor: 'default' }}>
              <span className="ntpl-title">
                {u.display_name}
                <span className="member-username"> @{u.username}</span>
                {u.role === 'admin' && <span className="settings-admin-badge" style={{ marginLeft: 6 }}>관리자</span>}
              </span>
              <span className="ntpl-body">{emails[u.id] || ''}</span>
            </span>
            <Chevron />
          </button>
        ))}
      </div>

      <button className="fab" onClick={() => setModal(true)} aria-label="계정 생성">＋</button>

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 2px 10px' }}>
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
            <div key={t.id} ref={setRowRef(t.id)} className={`ntpl-card${dragId === t.id ? ' drag-lift' : ''}`}
              style={{ opacity: dragId === t.id ? 1 : t.active ? 1 : 0.5 }}>
              <span
                className={`ntpl-emoji${editMode ? ' draggable' : ''}${dragId === t.id ? ' dragging' : ''}`}
                style={{ background: t.color || '#f4f2f0' }}
                onPointerDown={editMode ? startDrag(t.id) : undefined}
              >
                {t.emoji || '🔔'}
              </span>
              <button type="button" className="ntpl-main" disabled={editMode} onClick={() => openEdit(t)}>
                <span className="ntpl-title">{t.title_template || '(제목 없음)'}</span>
                <span className="ntpl-body">{t.body_template}{!t.active && ' · 비활성'}</span>
              </button>
            </div>
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

// 공휴일 관리: 가계부 페이지의 연월 컨트롤 바 + 캘린더 뷰와 같은 모양으로, 날짜를 누르면
// 공휴일로 추가/삭제할 수 있다(영업일 보정이 이 kr_holidays 테이블을 그대로 참조함).
function AdminHolidays() {
  const [month, setMonth] = useState(currentMonth());
  const [holidays, setHolidays] = useState({}); // 'YYYY-MM-DD' -> name
  const [busyDate, setBusyDate] = useState(null);

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  const todayStr = today();
  const todayDay = todayStr.slice(0, 7) === month ? Number(todayStr.slice(8, 10)) : null;
  const [yy, mm] = month.split('-');
  const label = `${yy} 년 ${Number(mm)} 월`;
  const pad = (n) => String(n).padStart(2, '0');

  const load = useCallback(() => {
    const from = `${month}-01`;
    const to = `${month}-${pad(daysInMonth)}`;
    db.listHolidays(from, to).then((rows) => {
      const map = {};
      for (const r of rows) map[r.date] = r.name;
      setHolidays(map);
    }).catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (day) => {
    const dateStr = `${month}-${pad(day)}`;
    const existing = holidays[dateStr];
    setBusyDate(dateStr);
    try {
      if (existing) {
        if (!confirm(`${Number(mm)}월 ${day}일 '${existing}'을(를) 공휴일에서 제거할까요?`)) return;
        await db.deleteHoliday(dateStr);
      } else {
        const name = prompt(`${Number(mm)}월 ${day}일을 공휴일로 추가합니다. 이름을 입력하세요.`, '공휴일');
        if (!name) return;
        await db.upsertHoliday(dateStr, name);
      }
      load();
    } catch (e) { alert(e.message); } finally { setBusyDate(null); }
  };

  const count = Object.keys(holidays).length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 2px 10px' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#191722' }}>이 달 공휴일</span>
        <span className="chip">{count}</span>
      </div>
      <p className="small muted" style={{ margin: '0 2px 14px' }}>
        날짜를 누르면 공휴일로 추가하거나(이미 있으면) 제거할 수 있어요. 반복 항목의 영업일 보정이 이 목록을 기준으로 동작해요.
      </p>

      {/* 월 이동 — 가계부 페이지와 동일한 구성 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))} style={roundBtn(32)}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <div style={{ position: 'relative', minWidth: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722', letterSpacing: '-.2px' }}>{label}</span>
          <input
            type="month" value={month} aria-label="연월 선택" className="catmodal-date-input"
            onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
          />
        </div>
        <button aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))} style={roundBtn(32)}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      </div>

      {/* 캘린더 — 가계부 페이지 캘린더 뷰와 동일한 구성(선택 대신 공휴일 표시) */}
      <div style={{ marginTop: 16, background: '#fff', borderRadius: 20, padding: '14px 12px 12px', boxShadow: '0 4px 16px rgba(25,23,34,.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#a29ead' }}>
          <span style={{ color: '#e0607a' }}>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style={{ color: '#7b93c9' }}>토</span>
        </div>
        <div style={{ marginTop: 7, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${month}-${pad(day)}`;
            const name = holidays[dateStr];
            const isToday = day === todayDay;
            return (
              <button
                key={day} type="button" onClick={() => toggle(day)} disabled={busyDate === dateStr}
                style={{
                  minHeight: 54, border: 'none', borderRadius: 10, padding: '5px 2px 3px', textAlign: 'center', cursor: 'pointer',
                  background: name ? '#FDE8EE' : 'transparent', fontFamily: 'inherit',
                  outline: isToday ? '1.5px solid #FF8A00' : '1.5px solid transparent', outlineOffset: -1.5,
                  opacity: busyDate === dateStr ? 0.5 : 1,
                }}>
                <div style={{ fontSize: 11, fontWeight: name ? 800 : 600, color: name ? '#FF4358' : '#6c6779' }}>{day}</div>
                {name && <div style={{ marginTop: 2, fontSize: 8.5, fontWeight: 700, color: '#FF4358', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
