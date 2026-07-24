import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon, today, addInterval, PERIOD_LABEL } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import MembersPanel from '../components/MembersPanel.jsx';
import SwipeRow from '../components/SwipeRow.jsx';

const PERIOD_UNITS = ['day', 'week', 'month', 'year'];
const KEEP = '__keep__'; // id 없이 이름만 있는 원천/분류(스냅샷) 유지용 센티넬

function SourceSelect({ sources, value, onChange, keepLabel }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">선택 안 함</option>
      {value === KEEP && <option value={KEEP}>{keepLabel} (기존)</option>}
      {sources.map((top) => (
        top.children?.length ? (
          <optgroup key={top.id} label={top.name}>
            <option value={top.id}>{top.name} (전체)</option>
            {top.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ) : <option key={top.id} value={top.id}>{top.name}</option>
      ))}
    </select>
  );
}
function CategorySelect({ cats, value, onChange, keepLabel }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">선택 안 함</option>
      {value === KEEP && <option value={KEEP}>{keepLabel} (기존)</option>}
      {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
    </select>
  );
}
function sourceNameOf(flat, id) {
  if (!id) return '';
  const s = flat.find((x) => x.id === Number(id));
  return s ? s.name : ''; // 세부 항목명만
}
const matchCatId = (cats, name) => { const c = cats.find((x) => x.name === name); return c ? String(c.id) : ''; };

export default function SubscriptionGroup({ gid, group, members, isOwner, leaderName, header, reloadMembers, onDeletedGroup }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('payments');
  const [sub, setSub] = useState(null);
  const [payments, setPayments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [cats, setCats] = useState([]);
  const [incomeCats, setIncomeCats] = useState([]);
  const [sources, setSources] = useState({ tree: [], flat: [] });
  const [recentExpenses, setRecentExpenses] = useState([]);

  const [payEditor, setPayEditor] = useState(null); // null | {rec?}
  const [depEditor, setDepEditor] = useState(null);
  const [setModal, setSetModal] = useState(false);

  const myMember = members.find((m) => m.user_id === user.id && m.role !== 'owner');
  const memberList = members.filter((m) => m.role !== 'owner');

  const loadSub = useCallback(() => db.getSubscription(gid).then(setSub).catch(() => setSub(null)), [gid]);
  const loadPay = useCallback(() => db.listPayments(gid).then(setPayments).catch(() => setPayments([])), [gid]);
  const loadDep = useCallback(() => db.listDeposits(gid).then(setDeposits).catch(() => setDeposits([])), [gid]);
  useEffect(() => { loadSub(); loadPay(); loadDep(); }, [loadSub, loadPay, loadDep]);
  useEffect(() => {
    db.listCategories('expense').then(setCats).catch(() => {});
    db.listCategories('income').then(setIncomeCats).catch(() => {});
    db.listSources().then(setSources).catch(() => {});
    db.listRecentExpenses(user.id).then(setRecentExpenses).catch(() => {});
  }, [user.id]);

  // 가계부에서 넘어온 편집 요청: ?edit=payment:ID | deposit:ID
  useEffect(() => {
    const edit = params.get('edit');
    if (!edit) return;
    const [kind, idStr] = edit.split(':');
    const id = Number(idStr);
    if (kind === 'payment') {
      const rec = payments.find((p) => p.id === id);
      if (rec) { setTab('payments'); setPayEditor({ rec }); setParams({}, { replace: true }); }
    } else if (kind === 'deposit') {
      const rec = deposits.find((d) => d.id === id);
      if (rec) { setTab('deposits'); setDepEditor({ rec }); setParams({}, { replace: true }); }
    }
  }, [params, payments, deposits, setParams]);

  const usedAmount = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalAmount = deposits.reduce((s, d) => s + Number(d.amount), 0);
  const remain = totalAmount - usedAmount;

  const delPayment = async (p) => {
    if (!confirm('결제 내역을 삭제할까요? (총대 가계부의 해당 지출도 삭제됩니다)')) return;
    try { await db.deletePayment(p.id); loadPay(); } catch (e) { alert(e.message); }
  };
  const delDeposit = async (d) => {
    if (!confirm('입금 내역을 삭제할까요? (연결된 가계부 항목도 삭제됩니다)')) return;
    try { await db.deleteDeposit(d.id); loadDep(); } catch (e) { alert(e.message); }
  };
  const deleteGroup = async () => {
    if (!confirm('그룹을 삭제하면 모든 결제·입금 내역이 삭제됩니다. 계속할까요?')) return;
    try { await db.deleteGroup(gid); onDeletedGroup(); } catch (e) { alert(e.message); }
  };

  const memberStats = memberList.map((m) => {
    const ds = deposits.filter((d) => d.member_id === m.id);
    const cum = ds.reduce((s, d) => s + Number(d.amount), 0);
    const periods = ds.reduce((s, d) => s + Number(d.periods || 0), 0);
    const last = ds.length ? ds.map((d) => d.date).sort().slice(-1)[0] : null;
    const base = m.start_date || (ds.length ? ds.map((d) => d.date).sort()[0] : null);
    const auto = base && sub ? addInterval(base, sub.period_unit, sub.period_count, periods) : (base || null);
    const next = m.next_due_override || auto;
    return { id: m.id, nickname: m.nickname, cum, last, next };
  });

  return (
    <div>
      {header}

      <div className="pill-toggle" style={{ display: 'flex', width: '100%', marginBottom: 14 }}>
        <button style={{ flex: 1 }} className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>결제내역</button>
        <button style={{ flex: 1 }} className={tab === 'deposits' ? 'active' : ''} onClick={() => setTab('deposits')}>입금내역</button>
        <button style={{ flex: 1 }} className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>통계</button>
        <button style={{ flex: 1 }} className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>멤버</button>
      </div>

      {tab === 'payments' && (
        <>
          {payments.length === 0 ? <div className="empty">결제 내역이 없습니다.</div> : payments.map((p) => (
            <SwipeRow key={p.id} deletable={isOwner} onDelete={() => delPayment(p)} onTap={() => isOwner && setPayEditor({ rec: p })}>
              <div className="tx" style={{ cursor: isOwner ? 'pointer' : 'default' }}>
                <span className="cat-emoji">{p.category_emoji || '💳'}</span>
                <div className="tx-main">
                  <div className="tx-title">{p.content || p.category_name}</div>
                  <div className="tx-sub">{p.date} · {[p.category_name, p.source_name].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="tx-amt expense">-{fmtWon(p.amount)}</div>
              </div>
            </SwipeRow>
          ))}
          {isOwner && <button className="fab" onClick={() => setPayEditor({})} aria-label="결제 추가">＋</button>}
        </>
      )}

      {tab === 'deposits' && (
        <>
          <div className="card">
            <div className="between" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>구독 설정</h3>
              {isOwner && <button className="btn sm" onClick={() => setSetModal(true)}>설정</button>}
            </div>
            {sub ? (
              <div className="small muted" style={{ lineHeight: 1.7 }}>
                방식: <b>{sub.mode === 'common' ? '공통(모임통장)' : '개인'}</b> · 정기결제일: {sub.billing_day ? `${sub.billing_day}일` : '-'}<br />
                정기결제금액: {sub.billing_amount ? fmtWon(sub.billing_amount) : '-'} · 정기입금액: {sub.deposit_amount ? fmtWon(sub.deposit_amount) : '-'}<br />
                주기: {sub.period_count}{PERIOD_LABEL[sub.period_unit]} · 입금분류: {sub.deposit_category ? `${sub.deposit_category_emoji || ''} ${sub.deposit_category}` : '-'}
              </div>
            ) : <div className="small muted">{isOwner ? '설정 버튼으로 구독을 설정하세요.' : '설정 전입니다.'}</div>}
          </div>

          {deposits.length === 0 ? <div className="empty">입금 내역이 없습니다.</div> : deposits.map((d) => {
            const mine = isOwner || (myMember && d.member_id === myMember.id);
            return (
              <SwipeRow key={d.id} deletable={mine} onDelete={() => delDeposit(d)} onTap={() => mine && setDepEditor({ rec: d })}>
                <div className="tx" style={{ cursor: mine ? 'pointer' : 'default' }}>
                  <span className="cat-emoji">{d.category_emoji || '💸'}</span>
                  <div className="tx-main">
                    <div className="tx-title">{d.member?.nickname || '멤버'} · {fmtWon(d.amount)} <span className="tag-group">{d.periods}회차</span></div>
                    <div className="tx-sub">{d.date} · {[d.content, d.category_name, d.deposit_source_name].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              </SwipeRow>
            );
          })}
          {(isOwner || myMember) && <button className="fab" onClick={() => setDepEditor({})} aria-label="입금 추가">＋</button>}
        </>
      )}

      {tab === 'stats' && (
        <>
          <div className="summary" style={{ marginBottom: 16 }}>
            <div className="box"><div className="lbl">잔여 금액</div><div className="val">{fmtWon(remain)}</div></div>
            <div className="box"><div className="lbl">총 금액</div><div className="val income">{fmtWon(totalAmount)}</div></div>
            <div className="box"><div className="lbl">사용 금액</div><div className="val expense">{fmtWon(usedAmount)}</div></div>
          </div>
          <div className="card">
            <h3>멤버별 입금 현황</h3>
            {memberStats.length === 0 ? <div className="empty">멤버가 없습니다.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="stat-table">
                  <thead><tr><th>닉네임</th><th>누적입금액</th><th>마지막 입금일</th><th>다음 입금일</th></tr></thead>
                  <tbody>
                    {memberStats.map((m) => (
                      <tr key={m.id} onClick={() => nav(`/groups/${gid}/member/${m.id}`)} style={{ cursor: 'pointer' }}>
                        <td>{m.nickname} ›</td><td>{fmtWon(m.cum)}</td><td className="muted">{m.last || '-'}</td><td>{m.next || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'members' && (
        <>
          <MembersPanel groupId={gid} members={members} isOwner={isOwner} leaderName={leaderName} onReload={reloadMembers} />
          {isOwner && <button className="btn danger block" onClick={deleteGroup}>그룹 삭제</button>}
        </>
      )}

      {payEditor && (
        <PaymentForm initial={payEditor.rec} cats={cats} sources={sources} onClose={() => setPayEditor(null)}
          onSave={async (p) => {
            if (payEditor.rec) await db.updatePayment(payEditor.rec.id, p);
            else await db.createPayment(gid, user.id, p);
            setPayEditor(null); loadPay();
          }} />
      )}
      {depEditor && (
        <DepositForm initial={depEditor.rec} sub={sub} cats={cats} incomeCats={incomeCats} sources={sources}
          members={isOwner ? memberList : (myMember ? [myMember] : [])} recentExpenses={recentExpenses} isOwner={isOwner}
          onClose={() => setDepEditor(null)}
          onSave={async (p) => {
            if (depEditor.rec) await db.updateDeposit(depEditor.rec.id, p);
            else await db.createDeposit({ ...p, group_id: gid });
            setDepEditor(null); loadDep();
          }} />
      )}
      {setModal && (
        <SettingsForm sub={sub} incomeCats={incomeCats} onClose={() => setSetModal(false)}
          onSave={async (s) => { await db.upsertSubscription(gid, s); setSetModal(false); loadSub(); }} />
      )}
    </div>
  );
}

function PaymentForm({ initial, cats, sources, onClose, onSave }) {
  const editing = !!initial;
  const defCat = cats.find((c) => c.name === '구독') || cats[0];
  const [f, setF] = useState(() => editing ? {
    date: initial.date, amount: String(initial.amount),
    categoryId: matchCatId(cats, initial.category_name) || (initial.category_name ? KEEP : ''),
    sourceId: initial.source_id ? String(initial.source_id) : '', content: initial.content || '', memo: initial.memo || '',
  } : { date: today(), amount: '', categoryId: defCat ? String(defCat.id) : '', sourceId: '', content: '', memo: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!f.amount || Number(f.amount) < 0) return setErr('금액을 입력하세요.');
    let category_name = '구독', category_emoji = '';
    if (f.categoryId === KEEP) { category_name = initial.category_name; category_emoji = initial.category_emoji; }
    else if (f.categoryId) { const c = cats.find((x) => String(x.id) === f.categoryId); if (c) { category_name = c.name; category_emoji = c.emoji || ''; } }
    setBusy(true); setErr('');
    try {
      await onSave({
        date: f.date, amount: Math.round(Number(f.amount)), category_name, category_emoji,
        source_id: f.sourceId ? Number(f.sourceId) : null, source_name: sourceNameOf(sources.flat, f.sourceId),
        content: f.content, memo: f.memo,
      });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title={editing ? '결제 내역 수정' : '결제 내역 추가'} onClose={onClose}>
      <div className="field"><label>금액</label>
        <div className="with-suffix"><input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /><span className="suffix">원</span></div>
      </div>
      <div className="grid2">
        <div className="field"><label>날짜</label><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="field"><label>분류</label>
          <CategorySelect cats={cats} value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} keepLabel={initial?.category_name} />
        </div>
      </div>
      <div className="field"><label>원천</label><SourceSelect sources={sources.tree} value={f.sourceId} onChange={(v) => setF({ ...f, sourceId: v })} /></div>
      <div className="field"><label>내용</label><input value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="예: 넷플릭스 12월" /></div>
      <div className="field"><label>메모</label><textarea value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} /></div>
      {err && <p className="error">{err}</p>}
      <p className="small muted">총대 개인 가계부의 지출과 자동 동기화됩니다.</p>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn block" onClick={onClose}>취소</button>
        <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </Modal>
  );
}

export function DepositForm({ initial, sub, cats, incomeCats = [], sources, members, recentExpenses = [], isOwner, onClose, onSave }) {
  const editing = !!initial;
  const defMemberCat = cats.find((c) => c.name === '구독');     // 멤버 지출 기본 '구독'
  const defLeaderCat = incomeCats.find((c) => c.name === sub?.deposit_category); // 총대 수입 기본 = 입금분류
  const [f, setF] = useState(() => editing ? {
    memberId: String(initial.member_id), date: initial.date, amount: String(initial.amount), periods: String(initial.periods || 1),
    // 멤버 영역
    mCatId: matchCatId(cats, initial.category_name) || (initial.category_name ? KEEP : ''),
    mSourceId: initial.source_name ? KEEP : '',
    // 총대 영역
    lCatId: matchCatId(incomeCats, initial.leader_category_name) || (initial.leader_category_name ? KEEP : ''),
    lSettleId: initial.leader_settlement_target_id ? String(initial.leader_settlement_target_id) : '',
    lSourceId: initial.deposit_source_name ? KEEP : '',
    content: initial.content || '', memo: initial.memo || '',
  } : {
    memberId: members[0] ? String(members[0].id) : '', date: today(),
    amount: sub?.deposit_amount ? String(sub.deposit_amount) : '', periods: '1',
    mCatId: defMemberCat ? String(defMemberCat.id) : '', mSourceId: '',
    lCatId: defLeaderCat ? String(defLeaderCat.id) : '', lSettleId: '', lSourceId: '',
    content: '', memo: '',
  });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const leaderCat = f.lCatId === KEEP
    ? { name: initial?.leader_category_name, emoji: initial?.leader_category_emoji }
    : incomeCats.find((c) => String(c.id) === f.lCatId);
  const leaderIsSettle = leaderCat?.name === '정산';

  const submit = async () => {
    if (!f.memberId) return setErr('멤버를 선택하세요.');
    if (!f.amount || Number(f.amount) < 0) return setErr('금액을 입력하세요.');

    // 멤버 가계부(지출) 필드
    let m_name = '', m_emoji = '', m_source = '';
    if (isOwner) {
      if (editing) { m_name = initial.category_name; m_emoji = initial.category_emoji; m_source = initial.source_name; }
      else { m_name = '구독'; m_emoji = defMemberCat?.emoji || ''; m_source = ''; }
    } else {
      if (f.mCatId === KEEP) { m_name = initial.category_name; m_emoji = initial.category_emoji; }
      else if (f.mCatId) { const c = cats.find((x) => String(x.id) === f.mCatId); if (c) { m_name = c.name; m_emoji = c.emoji || ''; } }
      m_source = f.mSourceId === KEEP ? (initial?.source_name || '') : sourceNameOf(sources.flat, f.mSourceId);
    }

    // 총대 가계부(수입) 필드
    let l_name = '', l_emoji = '', l_settle = null, l_source = '';
    if (isOwner) {
      if (f.lCatId === KEEP) { l_name = initial.leader_category_name; l_emoji = initial.leader_category_emoji; }
      else if (f.lCatId) { const c = incomeCats.find((x) => String(x.id) === f.lCatId); if (c) { l_name = c.name; l_emoji = c.emoji || ''; } }
      l_settle = (l_name === '정산' && f.lSettleId) ? Number(f.lSettleId) : null;
      l_source = f.lSourceId === KEEP ? (initial?.deposit_source_name || '') : sourceNameOf(sources.flat, f.lSourceId);
    } else {
      if (editing) { l_name = initial.leader_category_name; l_emoji = initial.leader_category_emoji; l_settle = initial.leader_settlement_target_id || null; l_source = initial.deposit_source_name; }
      else { l_name = sub?.deposit_category || ''; l_emoji = sub?.deposit_category_emoji || ''; l_settle = null; l_source = ''; }
    }

    setBusy(true); setErr('');
    try {
      await onSave({
        member_id: Number(f.memberId), date: f.date, amount: Math.round(Number(f.amount)),
        periods: Math.max(Number(f.periods) || 1, 1),
        category_name: m_name, category_emoji: m_emoji, source_id: null, source_name: m_source,
        deposit_source_name: l_source,
        leader_category_name: l_name, leader_category_emoji: l_emoji, leader_settlement_target_id: l_settle,
        content: f.content, memo: f.memo,
      });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title={editing ? '입금 내역 수정' : '입금 내역 추가'} onClose={onClose}>
      {/* 공통 */}
      <div className="field"><label>멤버</label>
        <select value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })} disabled={editing || members.length <= 1}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.nickname}</option>)}
          {editing && !members.some((m) => String(m.id) === String(f.memberId)) && <option value={f.memberId}>{initial.member?.nickname || '멤버'}</option>}
        </select>
      </div>
      <div className="grid2">
        <div className="field"><label>금액</label>
          <div className="with-suffix"><input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /><span className="suffix">원</span></div>
        </div>
        <div className="field"><label>기간(회차)</label><input type="number" min="1" value={f.periods} onChange={(e) => setF({ ...f, periods: e.target.value })} /></div>
      </div>
      <div className="field"><label>날짜</label><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>

      {isOwner ? (
        /* 총대 가계부 영역 */
        <div className="form-section">
          <div className="form-section-title">총대 가계부 (수입)</div>
          <div className="field"><label>분류</label>
            <CategorySelect cats={incomeCats} value={f.lCatId} onChange={(v) => setF({ ...f, lCatId: v })} keepLabel={initial?.leader_category_name} />
          </div>
          {leaderIsSettle && (
            <div className="field"><label>정산 대상 <span className="small muted">(정산할 지출 선택)</span></label>
              <select value={f.lSettleId} onChange={(e) => setF({ ...f, lSettleId: e.target.value })}>
                <option value="">선택 안 함</option>
                {recentExpenses.map((x) => (
                  <option key={x.id} value={x.id}>{x.date.slice(5)} {x.category_emoji || ''} {x.content || x.category_name || '지출'} ({fmtWon(x.amount)})</option>
                ))}
              </select>
            </div>
          )}
          <div className="field"><label>원천</label>
            <SourceSelect sources={sources.tree} value={f.lSourceId} onChange={(v) => setF({ ...f, lSourceId: v })} keepLabel={initial?.deposit_source_name} />
          </div>
        </div>
      ) : (
        /* 멤버 가계부 영역 */
        <div className="form-section">
          <div className="form-section-title">내 가계부 (지출)</div>
          <div className="field"><label>분류</label>
            <CategorySelect cats={cats} value={f.mCatId} onChange={(v) => setF({ ...f, mCatId: v })} keepLabel={initial?.category_name} />
          </div>
          <div className="field"><label>원천</label>
            <SourceSelect sources={sources.tree} value={f.mSourceId} onChange={(v) => setF({ ...f, mSourceId: v })} keepLabel={initial?.source_name} />
          </div>
        </div>
      )}

      <div className="field"><label>내용</label><input value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="예: 넷플릭스 회비" /></div>
      <div className="field"><label>메모</label><textarea value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} /></div>
      {err && <p className="error">{err}</p>}
      <p className="small muted">총대(수입)·멤버(지출) 가계부와 자동 동기화됩니다.</p>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn block" onClick={onClose}>취소</button>
        <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </Modal>
  );
}

function SettingsForm({ sub, incomeCats, onClose, onSave }) {
  const [f, setF] = useState({
    mode: sub?.mode || 'personal',
    billing_day: sub?.billing_day ? String(sub.billing_day) : '',
    billing_amount: sub?.billing_amount ? String(sub.billing_amount) : '',
    deposit_amount: sub?.deposit_amount ? String(sub.deposit_amount) : '',
    period_count: sub?.period_count ? String(sub.period_count) : '1',
    period_unit: sub?.period_unit || 'month',
  });
  const initCat = incomeCats.find((c) => c.name === sub?.deposit_category);
  const [depositCatId, setDepositCatId] = useState(initCat ? String(initCat.id) : '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const cat = incomeCats.find((c) => c.id === Number(depositCatId));
    setBusy(true);
    try {
      await onSave({
        mode: f.mode,
        billing_day: f.billing_day ? Number(f.billing_day) : null,
        billing_amount: f.billing_amount ? Math.round(Number(f.billing_amount)) : null,
        deposit_amount: f.deposit_amount ? Math.round(Number(f.deposit_amount)) : null,
        period_unit: f.period_unit, period_count: Math.max(Number(f.period_count) || 1, 1),
        deposit_category: cat?.name || '', deposit_category_emoji: cat?.emoji || '',
      });
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Modal title="구독 관리 설정" onClose={onClose}>
      <div className="field"><label>입금 방식</label>
        <div className="pill-toggle">
          <button type="button" className={f.mode === 'personal' ? 'active' : ''} onClick={() => setF({ ...f, mode: 'personal' })}>개인</button>
          <button type="button" className={f.mode === 'common' ? 'active' : ''} onClick={() => setF({ ...f, mode: 'common' })}>공통</button>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>개인: 총대 개인 계좌 / 공통: 모임통장 등 공동 계좌</p>
      </div>
      <div className="grid2">
        <div className="field"><label>정기결제일</label>
          <div className="with-suffix"><input type="number" min="1" max="31" value={f.billing_day} onChange={(e) => setF({ ...f, billing_day: e.target.value })} /><span className="suffix">일</span></div>
        </div>
        <div className="field"><label>정기결제금액</label>
          <div className="with-suffix"><input type="number" min="0" value={f.billing_amount} onChange={(e) => setF({ ...f, billing_amount: e.target.value })} /><span className="suffix">원</span></div>
        </div>
      </div>
      <div className="grid2">
        <div className="field"><label>정기입금액</label>
          <div className="with-suffix"><input type="number" min="0" value={f.deposit_amount} onChange={(e) => setF({ ...f, deposit_amount: e.target.value })} /><span className="suffix">원</span></div>
        </div>
        <div className="field"><label>주기</label>
          <div className="row">
            <input type="number" min="1" value={f.period_count} onChange={(e) => setF({ ...f, period_count: e.target.value })} style={{ width: 64 }} />
            <select value={f.period_unit} onChange={(e) => setF({ ...f, period_unit: e.target.value })}>
              {PERIOD_UNITS.map((u) => <option key={u} value={u}>{PERIOD_LABEL[u]}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="field"><label>입금 분류 <span className="small muted">(총대 수입 분류)</span></label>
        <select value={depositCatId} onChange={(e) => setDepositCatId(e.target.value)}>
          <option value="">선택 안 함</option>
          {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
        </select>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn block" onClick={onClose}>취소</button>
        <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </Modal>
  );
}
