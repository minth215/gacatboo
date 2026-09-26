import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon, PERIOD_LABEL, isSubscription } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { SettingsForm } from './SubscriptionGroup.jsx';

export default function GroupEdit() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [groupCats, setGroupCats] = useState([]);
  const [sub, setSub] = useState(null);
  const [incomeCats, setIncomeCats] = useState([]);
  const [setModal, setSetModal] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSub = () => db.getSubscription(gid).then(setSub).catch(() => {});

  useEffect(() => {
    db.getGroup(gid).then(({ group }) => {
      if (group.owner_id !== user.id) { alert('수정 권한이 없습니다.'); nav(`/groups/${gid}`); return; }
      setForm({
        name: group.name, description: group.description || '',
        category: group.category, category_emoji: group.category_emoji || '', color: group.color || '',
        start_date: group.start_date || '', end_date: group.end_date || '',
      });
    }).catch((e) => { alert(e.message); nav('/groups'); });
    db.listGroupCategories().then(setGroupCats).catch(() => {});
    loadSub();
    db.listCategories('income').then(setIncomeCats).catch(() => {});
  }, [gid]);

  if (!form) return <Spinner />;

  const save = async () => {
    if (!form.name.trim()) return setErr('그룹명을 입력하세요.');
    if (!form.start_date) return setErr('시작일자를 입력하세요.');
    if (form.end_date && form.end_date < form.start_date) return setErr('종료일자는 시작일자 이후여야 합니다.');
    setBusy(true); setErr('');
    try { await db.updateGroup(gid, form); nav(`/groups/${gid}`); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  const deleteGroup = async () => {
    if (!confirm('그룹을 삭제하면 그룹 내 모든 내역이 삭제됩니다. 계속할까요?')) return;
    try { await db.deleteGroup(gid); nav('/groups'); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="그룹 정보" />

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
              onClick={() => setForm({ ...form, category: c.name })}
              style={{ border: 'none' }}>
              {c.name}
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

      {isSubscription(form.category) && (
        <div className="form-section-card">
          <div className="between" style={{ marginBottom: 8 }}>
            <div className="form-section-title" style={{ marginBottom: 0 }}>구독 설정</div>
            <button type="button" className="btn sm" onClick={() => setSetModal(true)}>설정</button>
          </div>
          {sub ? (
            <div className="small muted" style={{ lineHeight: 1.7 }}>
              방식: <b>{sub.mode === 'common' ? '공통(모임통장)' : '개인'}</b> · 정기결제일: {sub.billing_day ? `${sub.billing_day}일` : '-'}<br />
              정기결제금액: {sub.billing_amount ? fmtWon(sub.billing_amount) : '-'} · 정기입금액: {sub.deposit_amount ? fmtWon(sub.deposit_amount) : '-'}<br />
              주기: {sub.period_count}{PERIOD_LABEL[sub.period_unit]} · 입금분류: {sub.deposit_category ? `${sub.deposit_category_emoji || ''} ${sub.deposit_category}` : '-'}
            </div>
          ) : <div className="small muted">설정 버튼으로 구독을 설정하세요.</div>}
        </div>
      )}

      {err && <p className="error">{err}</p>}
      <button className="btn-ink-pill" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
      <button type="button" onClick={deleteGroup} style={{ display: 'block', margin: '12px auto 0', border: 'none', background: 'transparent', color: 'var(--expense)', fontSize: 12.5, fontWeight: 700, padding: '6px 10px', cursor: 'pointer' }}>그룹 삭제</button>

      {setModal && (
        <SettingsForm sub={sub} incomeCats={incomeCats} onClose={() => setSetModal(false)}
          onSave={async (s) => { await db.upsertSubscription(gid, s); setSetModal(false); loadSub(); }} />
      )}
    </div>
  );
}
