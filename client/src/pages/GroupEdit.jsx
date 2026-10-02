import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon, PERIOD_LABEL, isSubscription, isSettlement, dotDate } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { SettingsForm } from './SubscriptionGroup.jsx';

const PALETTE = ['#EEEBFE', '#E8F4EC', '#FDEEE6', '#E6EEFD', '#FDE8EE', '#FBF1D3', '#FDE2E2'];

const fieldStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: '#191722', background: '#faf9f8',
  border: '1.5px solid #efeef2', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

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
        owner_account: group.owner_account || '', owner_kakaopay_link: group.owner_kakaopay_link || '',
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
    try { await db.updateGroup(gid, form); nav(-1); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  const deleteGroup = async () => {
    if (!confirm('그룹을 삭제하면 그룹 내 모든 내역이 삭제됩니다. 계속할까요?')) return;
    try { await db.deleteGroup(gid); nav('/groups'); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="그룹 정보" flat />

      <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 16px rgba(25,23,34,.05)', padding: '24px 20px 22px', marginTop: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ position: 'relative', width: 96, height: 96 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 26, background: form.color || 'transparent', border: '1.5px solid #efeef2',
              boxShadow: '0 3px 10px rgba(25,23,34,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 38, pointerEvents: 'none',
            }}>
              {form.category_emoji || '💸'}
            </div>
            <input
              type="text" value={form.category_emoji} maxLength={2}
              onChange={(e) => setForm({ ...form, category_emoji: [...e.target.value].slice(-1).join('') })}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', textAlign: 'center', fontSize: 38, fontFamily: 'inherit', color: 'transparent', caretColor: '#191722', background: 'transparent', border: 'none', borderRadius: 26, outline: 'none' }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#8b8798' }}>그룹을 나타낼 이모지를 직접 입력해 주세요</div>
          </div>
        </div>

        <div style={{ height: 1, background: '#f0eee9', margin: '0 0 20px' }} />

        <div style={{ fontSize: 13, fontWeight: 700, color: '#191722', textAlign: 'center', marginBottom: 11 }}>배경 색</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8 }}>
          <button
            type="button" onClick={() => setForm({ ...form, color: '' })}
            style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: '#fff', border: 'none', boxShadow: form.color === '' ? '0 0 0 2px #fdfcfe, 0 0 0 4px #47444F' : 'inset 0 0 0 1.2px rgba(0,0,0,.18)', cursor: 'pointer', padding: 0, position: 'relative', overflow: 'hidden' }}
          >
            <svg width="30" height="30" viewBox="0 0 30 30" style={{ position: 'absolute', inset: 0 }}><line x1="6" y1="24" x2="24" y2="6" stroke="#c9455f" strokeWidth="1.3" /></svg>
          </button>
          {PALETTE.map((sw) => (
            <button
              type="button" key={sw} aria-label={sw} onClick={() => setForm({ ...form, color: sw })}
              style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: sw, border: 'none', boxShadow: form.color === sw ? '0 0 0 2px #fdfcfe, 0 0 0 4px #47444F' : 'inset 0 0 0 1px rgba(0,0,0,.07)', cursor: 'pointer', padding: 0 }}
            />
          ))}
        </div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>그룹 이름<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
        <input type="text" placeholder="그룹 이름 입력" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={fieldStyle} />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>카테고리<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
        {groupCats.length === 0 ? (
          <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            카테고리가 없습니다. <button type="button" className="edit-link" onClick={() => nav('/settings/group-categories')}>편집 ›</button>
          </div>
        ) : (
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ ...fieldStyle, appearance: 'none' }}>
            {!groupCats.some((c) => c.name === form.category) && form.category && (
              <option value={form.category}>{form.category}</option>
            )}
            {groupCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        )}
      </label>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>시작일자<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
          <div className="catmodal-date-field">
            <div className={`catmodal-date-value${form.start_date ? '' : ' placeholder'}`}>{form.start_date ? dotDate(form.start_date) : '날짜 선택'}</div>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="catmodal-date-input" />
          </div>
        </label>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>종료일자<span style={{ fontSize: 11, fontWeight: 600, color: '#b0b0b8', marginLeft: 2 }}> 선택</span></span>
          <div className="catmodal-date-field">
            <div className={`catmodal-date-value${form.end_date ? '' : ' placeholder'}`}>{form.end_date ? dotDate(form.end_date) : '날짜 선택'}</div>
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="catmodal-date-input" />
          </div>
        </label>
      </div>
      {form.end_date && <p className="small muted" style={{ marginTop: -10, marginBottom: 18 }}>종료일자를 입력하면 종료된 그룹으로 표시됩니다.</p>}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>코멘트<span style={{ fontSize: 11, fontWeight: 600, color: '#b0b0b8', marginLeft: 2 }}> 선택</span></span>
        <textarea
          placeholder="그룹을 소개하는 한마디를 남겨 보세요" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }}
        />
      </label>

      {isSubscription(form.category) && (
        <div className="form-section-card" style={{ marginTop: 18 }}>
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

      {isSettlement(form.category) && (
        <div className="form-section-card" style={{ marginTop: 18 }}>
          <div className="form-section-title">총무 입금 정보</div>
          <p className="small muted" style={{ margin: '-2px 0 8px' }}>정산 미완료 멤버가 본인 카드를 누르면 뜨는 송금 안내에 사용됩니다.</p>
          <div className="field">
            <label>입금 계좌</label>
            <input value={form.owner_account} onChange={(e) => setForm({ ...form, owner_account: e.target.value })} placeholder="예: 카카오뱅크 3333-01-1234567" />
          </div>
          <div className="field">
            <label>카카오페이 송금 링크</label>
            <input value={form.owner_kakaopay_link} onChange={(e) => setForm({ ...form, owner_kakaopay_link: e.target.value })} placeholder="카카오페이 앱에서 만든 송금 링크를 붙여넣으세요" />
          </div>
        </div>
      )}

      {err && <p className="error" style={{ marginTop: 14 }}>{err}</p>}
      <button className="btn-ink-pill" disabled={busy} onClick={save} style={{ marginTop: 20 }}>{busy ? '저장 중…' : '저장'}</button>
      <button type="button" onClick={deleteGroup} style={{ display: 'block', margin: '12px auto 0', border: 'none', background: 'transparent', color: 'var(--expense)', fontSize: 12.5, fontWeight: 700, padding: '6px 10px', cursor: 'pointer' }}>그룹 삭제</button>

      {setModal && (
        <SettingsForm sub={sub} incomeCats={incomeCats} onClose={() => setSetModal(false)}
          onSave={async (s) => { await db.upsertSubscription(gid, s); setSetModal(false); loadSub(); }} />
      )}
    </div>
  );
}
