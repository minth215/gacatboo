import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon, today, addInterval, PERIOD_LABEL } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import MembersPanel from '../components/MembersPanel.jsx';

const PERIOD_UNITS = ['day', 'week', 'month', 'year'];

// 원천 select (부모 > 자식)
function SourceSelect({ sources, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">선택 안 함</option>
      {sources.map((top) => (
        top.children?.length ? (
          <optgroup key={top.id} label={top.name}>
            <option value={top.id}>{top.name} (전체)</option>
            {top.children.map((c) => <option key={c.id} value={c.id}>{top.name} &gt; {c.name}</option>)}
          </optgroup>
        ) : <option key={top.id} value={top.id}>{top.name}</option>
      ))}
    </select>
  );
}

function sourceNameOf(flat, id) {
  if (!id) return '';
  const s = flat.find((x) => x.id === Number(id));
  if (!s) return '';
  if (s.parent_id) { const p = flat.find((x) => x.id === s.parent_id); return p ? `${p.name} > ${s.name}` : s.name; }
  return s.name;
}

export default function SubscriptionGroup({ gid, group, members, isOwner, leaderName, header, reloadMembers, onDeletedGroup }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('payments');
  const [sub, setSub] = useState(null);
  const [payments, setPayments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [cats, setCats] = useState([]);       // 현재 사용자 지출 분류
  const [incomeCats, setIncomeCats] = useState([]); // 현재 사용자 수입 분류 (입금분류 설정용)
  const [sources, setSources] = useState({ tree: [], flat: [] });

  const [payModal, setPayModal] = useState(false);
  const [depModal, setDepModal] = useState(false);
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
  }, []);

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

  // 멤버별 통계
  const memberStats = memberList.map((m) => {
    const ds = deposits.filter((d) => d.member_id === m.id);
    const cum = ds.reduce((s, d) => s + Number(d.amount), 0);
    const periods = ds.reduce((s, d) => s + Number(d.periods || 0), 0);
    const last = ds.length ? ds.map((d) => d.date).sort().slice(-1)[0] : null;
    const base = m.start_date || (ds.length ? ds.map((d) => d.date).sort()[0] : null);
    const next = base && sub ? addInterval(base, sub.period_unit, sub.period_count, periods) : (base || null);
    return { nickname: m.nickname, cum, last, next };
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

      {/* ---------- 결제내역 ---------- */}
      {tab === 'payments' && (
        <>
          {payments.length === 0 ? (
            <div className="empty">결제 내역이 없습니다.</div>
          ) : payments.map((p) => (
            <div className="tx" key={p.id}>
              <span className="cat-emoji">{p.category_emoji || '💳'}</span>
              <div className="tx-main">
                <div className="tx-title">{p.content || p.category_name}</div>
                <div className="tx-sub">{p.date} · {[p.category_name, p.source_name].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="tx-amt expense">-{fmtWon(p.amount)}</div>
              {isOwner && <button className="btn sm ghost" style={{ color: 'var(--muted)' }} onClick={() => delPayment(p)}>🗑</button>}
            </div>
          ))}
          {isOwner && <button className="fab" onClick={() => setPayModal(true)} aria-label="결제 추가">＋</button>}
        </>
      )}

      {/* ---------- 입금내역 ---------- */}
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

          {deposits.length === 0 ? (
            <div className="empty">입금 내역이 없습니다.</div>
          ) : deposits.map((d) => {
            const canDel = isOwner || (myMember && d.member_id === myMember.id);
            return (
              <div className="tx" key={d.id}>
                <span className="cat-emoji">{d.category_emoji || '💸'}</span>
                <div className="tx-main">
                  <div className="tx-title">{d.member?.nickname || '멤버'} · {fmtWon(d.amount)} <span className="tag-group">{d.periods}회차</span></div>
                  <div className="tx-sub">{d.date} · {[d.content, d.category_name, d.deposit_source_name].filter(Boolean).join(' · ')}</div>
                </div>
                {canDel && <button className="btn sm ghost" style={{ color: 'var(--muted)' }} onClick={() => delDeposit(d)}>🗑</button>}
              </div>
            );
          })}
          {(isOwner || myMember) && <button className="fab" onClick={() => setDepModal(true)} aria-label="입금 추가">＋</button>}
        </>
      )}

      {/* ---------- 통계 ---------- */}
      {tab === 'stats' && (
        <>
          <div className="summary" style={{ marginBottom: 16 }}>
            <div className="box"><div className="lbl">잔여 금액</div><div className="val">{fmtWon(remain)}</div></div>
            <div className="box"><div className="lbl">총 금액</div><div className="val income">{fmtWon(totalAmount)}</div></div>
            <div className="box"><div className="lbl">사용 금액</div><div className="val expense">{fmtWon(usedAmount)}</div></div>
          </div>
          <div className="card">
            <h3>멤버별 입금 현황</h3>
            {memberStats.length === 0 ? (
              <div className="empty">멤버가 없습니다.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="stat-table">
                  <thead><tr><th>닉네임</th><th>누적입금액</th><th>마지막 입금일</th><th>다음 입금일</th></tr></thead>
                  <tbody>
                    {memberStats.map((m, i) => (
                      <tr key={i}>
                        <td>{m.nickname}</td>
                        <td>{fmtWon(m.cum)}</td>
                        <td className="muted">{m.last || '-'}</td>
                        <td>{m.next || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------- 멤버 ---------- */}
      {tab === 'members' && (
        <>
          <MembersPanel groupId={gid} members={members} isOwner={isOwner} leaderName={leaderName} onReload={reloadMembers} />
          {isOwner && <button className="btn danger block" onClick={deleteGroup}>그룹 삭제</button>}
        </>
      )}

      {payModal && (
        <PaymentForm cats={cats} sources={sources} onClose={() => setPayModal(false)}
          onSave={async (p) => { await db.createPayment(gid, user.id, p); setPayModal(false); loadPay(); }} />
      )}
      {depModal && (
        <DepositForm groupId={gid} sub={sub} cats={cats} sources={sources}
          members={isOwner ? memberList : (myMember ? [myMember] : [])}
          onClose={() => setDepModal(false)}
          onSave={async (p) => { await db.createDeposit(p); setDepModal(false); loadDep(); }} />
      )}
      {setModal && (
        <SettingsForm sub={sub} incomeCats={incomeCats} onClose={() => setSetModal(false)}
          onSave={async (s) => { await db.upsertSubscription(gid, s); setSetModal(false); loadSub(); }} />
      )}
    </div>
  );
}

// ---------- 결제 입력 폼 ----------
function PaymentForm({ cats, sources, onClose, onSave }) {
  const def = cats.find((c) => c.name === '구독') || cats[0];
  const [f, setF] = useState({ date: today(), amount: '', categoryId: def ? String(def.id) : '', sourceId: '', content: '', memo: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!f.amount || Number(f.amount) < 0) return setErr('금액을 입력하세요.');
    const cat = cats.find((c) => c.id === Number(f.categoryId));
    setBusy(true); setErr('');
    try {
      await onSave({
        date: f.date, amount: Math.round(Number(f.amount)),
        category_name: cat?.name || '구독', category_emoji: cat?.emoji || '',
        source_id: f.sourceId ? Number(f.sourceId) : null, source_name: sourceNameOf(sources.flat, f.sourceId),
        content: f.content, memo: f.memo,
      });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title="결제 내역 추가" onClose={onClose}>
      <div className="field"><label>금액</label>
        <div className="with-suffix"><input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /><span className="suffix">원</span></div>
      </div>
      <div className="grid2">
        <div className="field"><label>날짜</label><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="field"><label>분류</label>
          <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">선택 안 함</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>원천</label><SourceSelect sources={sources.tree} value={f.sourceId} onChange={(v) => setF({ ...f, sourceId: v })} /></div>
      <div className="field"><label>내용</label><input value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="예: 넷플릭스 12월" /></div>
      <div className="field"><label>메모</label><textarea value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} /></div>
      {err && <p className="error">{err}</p>}
      <p className="small muted">저장 시 총대 개인 가계부에 지출로 자동 반영됩니다.</p>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn block" onClick={onClose}>취소</button>
        <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </Modal>
  );
}

// ---------- 입금 입력 폼 ----------
function DepositForm({ groupId, sub, cats, sources, members, onClose, onSave }) {
  const [f, setF] = useState({
    memberId: members[0] ? String(members[0].id) : '',
    date: today(), amount: sub?.deposit_amount ? String(sub.deposit_amount) : '',
    periods: '1', categoryId: '', sourceId: '', depositSourceId: '', content: '', memo: '',
  });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!f.memberId) return setErr('멤버를 선택하세요.');
    if (!f.amount || Number(f.amount) < 0) return setErr('금액을 입력하세요.');
    const cat = cats.find((c) => c.id === Number(f.categoryId));
    setBusy(true); setErr('');
    try {
      await onSave({
        group_id: groupId, member_id: Number(f.memberId), date: f.date,
        amount: Math.round(Number(f.amount)), periods: Math.max(Number(f.periods) || 1, 1),
        category_name: cat?.name || '', category_emoji: cat?.emoji || '',
        source_id: null, source_name: sourceNameOf(sources.flat, f.sourceId),
        deposit_source_name: sourceNameOf(sources.flat, f.depositSourceId), content: f.content, memo: f.memo,
      });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title="입금 내역 추가" onClose={onClose}>
      <div className="field"><label>멤버</label>
        <select value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })} disabled={members.length <= 1}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.nickname}</option>)}
        </select>
      </div>
      <div className="grid2">
        <div className="field"><label>금액</label>
          <div className="with-suffix"><input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /><span className="suffix">원</span></div>
        </div>
        <div className="field"><label>기간(회차)</label><input type="number" min="1" value={f.periods} onChange={(e) => setF({ ...f, periods: e.target.value })} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>날짜</label><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="field"><label>분류</label>
          <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">선택 안 함</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>원천</label><SourceSelect sources={sources.tree} value={f.sourceId} onChange={(v) => setF({ ...f, sourceId: v })} /></div>
      <div className="field"><label>입금수단 <span className="small muted">(총대의 원천)</span></label>
        <SourceSelect sources={sources.tree} value={f.depositSourceId} onChange={(v) => setF({ ...f, depositSourceId: v })} />
      </div>
      <div className="field"><label>내용</label><input value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="예: 넷플릭스 회비" /></div>
      <div className="field"><label>메모</label><textarea value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} /></div>
      {err && <p className="error">{err}</p>}
      <p className="small muted">총대에게는 수입, 멤버(회원)에게는 지출로 각 가계부에 자동 반영됩니다.</p>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn block" onClick={onClose}>취소</button>
        <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </Modal>
  );
}

// ---------- 구독 설정 폼 ----------
function SettingsForm({ sub, incomeCats, onClose, onSave }) {
  const [f, setF] = useState({
    mode: sub?.mode || 'personal',
    billing_day: sub?.billing_day ? String(sub.billing_day) : '',
    billing_amount: sub?.billing_amount ? String(sub.billing_amount) : '',
    deposit_amount: sub?.deposit_amount ? String(sub.deposit_amount) : '',
    period_count: sub?.period_count ? String(sub.period_count) : '1',
    period_unit: sub?.period_unit || 'month',
    depositCatId: '',
  });
  // 입금분류 초기값: 이름 매칭
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
