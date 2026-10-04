import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

const DEFAULT_PASSWORD = 'gacatboo!';

export default function AdminUserDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user: me } = useAuth();
  const [target, setTarget] = useState(null);
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [pw, setPw] = useState(DEFAULT_PASSWORD);
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const load = useCallback(() => {
    db.listUsers().then((rows) => {
      const t = rows.find((u) => u.id === id);
      if (!t) { alert('회원을 찾을 수 없습니다.'); nav('/admin'); return; }
      setTarget(t);
    }).catch((e) => { alert(e.message); nav('/admin'); });
    db.listUserEmails().then((rows) => {
      const found = (rows || []).find((r) => r.id === id);
      setEmail(found?.email || '');
      setEmailErr('');
    }).catch((e) => setEmailErr(e.message));
  }, [id, nav]);
  useEffect(() => { load(); }, [load]);

  if (!target) return <Spinner />;

  const isSelf = target.id === me.id;

  const changeRole = async (role) => {
    if (role === target.role) return;
    if (role === 'user') {
      const all = await db.listUsers().catch(() => []);
      if (all.filter((x) => x.role === 'admin').length <= 1) return alert('최소 한 명의 관리자가 필요합니다.');
    }
    if (role === 'admin' && !confirm(`${target.display_name}님을 관리자로 변경할까요?`)) return;
    setBusy(true);
    try { await db.setUserRole(target.id, role); setTarget({ ...target, role }); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const changeStatus = async (status) => {
    if (status === (target.status === 'approved' ? 'approved' : 'rejected')) return;
    if (status === 'rejected' && !confirm(`${target.display_name}님을 비활성 상태로 변경할까요?`)) return;
    setBusy(true);
    try { await db.setUserStatus(target.id, status); setTarget({ ...target, status }); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    if (!pw.trim()) return setPwErr('새 비밀번호를 입력하세요.');
    setPwBusy(true); setPwErr('');
    try {
      await db.resetUserPassword(target.id, pw.trim());
      setPwModal(false);
      alert('비밀번호가 초기화되었습니다.');
    } catch (e2) { setPwErr(e2.message); } finally { setPwBusy(false); }
  };

  const removeAccount = async () => {
    if (!confirm(`${target.display_name}(@${target.username}) 계정을 삭제할까요?`)) return;
    try { await db.deleteUser(target.id); nav('/admin'); }
    catch (e) { alert(e.message); }
  };

  const statusValue = target.status === 'approved' ? 'approved' : 'rejected';

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="회원 상세" flat />

      <div style={{ marginTop: 14, background: '#fff', borderRadius: 20, boxShadow: '0 4px 16px rgba(25,23,34,.05)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#191722', letterSpacing: '-.3px' }}>{target.display_name}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#a29ead' }}>@{target.username}</span>
            {target.role === 'admin' && <span className="settings-admin-badge">관리자</span>}
          </div>
        </div>
        <div style={{ padding: '0 18px 18px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 400, color: '#a29ead', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email || (emailErr ? <>이메일을 불러오지 못했습니다. <code>admin</code> Edge Function을 재배포했는지 확인해 주세요.</> : '')}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="settings-group-label">역할 / 상태</div>
        <div className="tx-daycard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#191722' }}>역할</span>
            <select className="admin-select" value={target.role} disabled={busy || isSelf} onChange={(e) => changeRole(e.target.value)}>
              <option value="user">일반</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderTop: '1.5px solid #f2f1f5' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#191722' }}>상태</span>
            <select className="admin-select" value={statusValue} disabled={busy || isSelf} onChange={(e) => changeStatus(e.target.value)}>
              <option value="approved">활성</option>
              <option value="rejected">비활성</option>
            </select>
          </div>
        </div>
        {isSelf && <p className="small muted" style={{ marginTop: 8 }}>본인 계정은 여기서 역할/상태를 변경할 수 없습니다.</p>}
      </div>

      <button className="btn-ink-pill" style={{ marginTop: 22 }} onClick={() => { setPw(DEFAULT_PASSWORD); setPwErr(''); setPwModal(true); }}>
        비밀번호 초기화
      </button>

      {!isSelf && (
        <button type="button" onClick={removeAccount} style={{ display: 'block', margin: '14px auto 0', border: 'none', background: 'transparent', color: 'var(--expense)', fontSize: 12.5, fontWeight: 700, padding: '6px 10px', cursor: 'pointer' }}>
          계정 삭제
        </button>
      )}

      {pwModal && (
        <Modal title="비밀번호 초기화" onClose={() => setPwModal(false)}>
          <form onSubmit={resetPassword}>
            <div className="field"><label>새 비밀번호</label>
              <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></div>
            {pwErr && <p className="error">{pwErr}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn block" onClick={() => setPwModal(false)}>취소</button>
              <button className="btn primary block" disabled={pwBusy}>{pwBusy ? '처리 중…' : '확인'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
