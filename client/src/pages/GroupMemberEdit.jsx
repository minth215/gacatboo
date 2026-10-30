import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { dotDate } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

// 그룹 상세 > 멤버 탭 > 멤버 카드 → 멤버 수정 페이지(총무만). 이름/시작일자/종료일자/메모.
// 연락처는 쓰지 않아 화면에 두지 않는다(저장 시 기존 값 그대로 유지).
const fieldStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)',
  border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const labelStyle = { fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' };
const optional = <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-tx-b0b0b8)', marginLeft: 2 }}> 선택</span>;

// 보이는 글자는 직접 그리고 실제 <input type="date">를 투명하게 덮어 탭만 받는 날짜 칸
function DateBox({ value, onChange }) {
  return (
    <div style={{ ...fieldStyle, position: 'relative' }}>
      <span style={{ color: value ? 'var(--k-tx-191722)' : 'var(--k-tx-b6b2c0)' }}>{value ? dotDate(value) : '날짜 선택'}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', cursor: 'pointer' }} />
    </div>
  );
}

export default function GroupMemberEdit() {
  const { id, memberId } = useParams();
  const gid = Number(id);
  const mid = Number(memberId);
  const nav = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [member, setMember] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.getGroup(gid).then(({ group: g, members }) => {
      const m = members.find((x) => x.id === mid);
      if (!m) { alert('멤버를 찾을 수 없습니다.'); nav(-1); return; }
      setGroup(g); setMember(m);
      setForm({ nickname: m.nickname || '', start_date: m.start_date || '', end_date: m.end_date || '', memo: m.memo || '' });
    }).catch((e) => { alert(e.message); nav(-1); });
  }, [gid, mid, nav]);

  const save = async () => {
    if (!form.nickname.trim()) return alert('이름을 입력하세요.');
    if (!form.start_date) return alert('시작일자를 입력하세요.');
    if (busy) return;
    setBusy(true);
    try {
      await db.updateMember(mid, gid, { ...form, contact: member.contact || '' });
      nav(-1);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  if (!form) return <Spinner />;
  if (group.owner_id !== user.id) return <div className="empty empty-center">총무만 멤버 정보를 수정할 수 있습니다.</div>;

  return (
    <div style={{ padding: '44px 0 24px' }}>
      <PageHeader title="멤버 수정" flat />
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>이름 <span style={{ color: '#FF3B5C' }}>*</span></span>
          <input type="text" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="그룹 내에서 보일 이름" style={fieldStyle} />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>시작일자 <span style={{ color: '#FF3B5C' }}>*</span></span>
            <DateBox value={form.start_date} onChange={(v) => setForm((f) => ({ ...f, start_date: v }))} />
          </label>
          <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>종료일자{optional}</span>
            <DateBox value={form.end_date} onChange={(v) => setForm((f) => ({ ...f, end_date: v }))} />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>메모{optional}</span>
          <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="총무만 볼 수 있는 메모" rows={3} style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }} />
        </label>
        <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy || !form.nickname.trim() || !form.start_date} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}
