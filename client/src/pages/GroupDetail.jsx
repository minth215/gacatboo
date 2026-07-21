import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { PALETTE } from '../lib/chartSetup.js';
import { currentMonth, shiftMonth, monthLabel, fmtWon } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import TransactionForm from '../components/TransactionForm.jsx';
import TransactionList from '../components/TransactionList.jsx';

export default function GroupDetail() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState('ledger'); // ledger | stats | members
  const [month, setMonth] = useState(currentMonth());
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [txs, setTxs] = useState([]);
  const [stats, setStats] = useState(null);
  const [modal, setModal] = useState(null);
  const [newMember, setNewMember] = useState('');
  const [err, setErr] = useState('');

  const isOwner = group && group.owner_id === user.id;

  const loadGroup = useCallback(() => {
    db.getGroup(gid).then(({ group, members }) => { setGroup(group); setMembers(members); })
      .catch((e) => { alert(e.message); nav('/groups'); });
  }, [gid, nav]);

  const loadTxs = useCallback(() => {
    db.listTransactions({ month, groupId: gid }).then(setTxs).catch(() => setTxs([]));
  }, [gid, month]);

  const loadStats = useCallback(() => {
    if (!members.length) return;
    db.groupStats(gid, month, members).then(setStats).catch(() => setStats(null));
  }, [gid, month, members]);

  useEffect(() => { loadGroup(); }, [loadGroup]);
  useEffect(() => { loadTxs(); }, [loadTxs]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const canEdit = (t) => t.created_by === user.id;
  const removeTx = async (t) => {
    if (!confirm('이 항목을 삭제할까요?')) return;
    try { await db.deleteTransaction(t.id); loadTxs(); loadStats(); } catch (e) { alert(e.message); }
  };

  const addMember = async (e) => {
    e.preventDefault();
    setErr('');
    if (!newMember.trim()) return;
    try { await db.addGroupMember(gid, newMember.trim()); setNewMember(''); loadGroup(); }
    catch (e2) { setErr(e2.message); }
  };
  const removeMember = async (m) => {
    if (m.role === 'owner') return;
    if (!confirm(`${m.display_name}님을 그룹에서 제거할까요?`)) return;
    try { await db.removeGroupMember(gid, m.user_id); loadGroup(); } catch (e) { alert(e.message); }
  };
  const deleteGroup = async () => {
    if (!confirm('그룹을 삭제하면 그룹 내 모든 항목이 삭제됩니다. 계속할까요?')) return;
    try { await db.deleteGroup(gid); nav('/groups'); } catch (e) { alert(e.message); }
  };

  if (!group) return <div className="empty">불러오는 중…</div>;

  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav('/groups')} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 그룹 목록</button>
      <div className="card">
        <div className="between">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{group.name}</div>
            <div className="small muted" style={{ marginTop: 2 }}>{group.description || '설명 없음'}</div>
          </div>
          <span className="chip">{group.category}</span>
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>총무 {group.owner_name} · 멤버 {members.length}명</div>
      </div>

      <div className="pill-toggle" style={{ display: 'flex', width: '100%', marginBottom: 14 }}>
        <button style={{ flex: 1 }} className={tab === 'ledger' ? 'active' : ''} onClick={() => setTab('ledger')}>내역</button>
        <button style={{ flex: 1 }} className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>통계</button>
        <button style={{ flex: 1 }} className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>멤버</button>
      </div>

      {tab !== 'members' && (
        <div className="month-nav">
          <button onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <div className="mlabel">{monthLabel(month)}</div>
          <button onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
      )}

      {tab === 'ledger' && (
        <>
          <TransactionList transactions={txs} canEdit={canEdit} onEdit={(t) => setModal({ tx: t })} onDelete={removeTx} />
          <button className="fab" onClick={() => setModal({})} aria-label="추가">＋</button>
        </>
      )}

      {tab === 'stats' && stats && (
        <>
          <div className="summary" style={{ marginBottom: 16 }}>
            <div className="box"><div className="lbl">수입</div><div className="val income">{fmtWon(stats.totals.income)}</div></div>
            <div className="box"><div className="lbl">지출</div><div className="val expense">{fmtWon(stats.totals.expense)}</div></div>
            <div className="box"><div className="lbl">합계</div><div className="val">{fmtWon(stats.totals.balance)}</div></div>
          </div>
          <div className="card">
            <h3>멤버별 지출/수입</h3>
            {stats.byMember.every((m) => !m.income && !m.expense) ? (
              <div className="empty">데이터가 없습니다.</div>
            ) : (
              <div className="chart-box">
                <Bar data={{
                  labels: stats.byMember.map((m) => m.name),
                  datasets: [
                    { label: '수입', data: stats.byMember.map((m) => m.income), backgroundColor: '#2563eb', borderRadius: 6, maxBarThickness: 26 },
                    { label: '지출', data: stats.byMember.map((m) => m.expense), backgroundColor: '#e5484d', borderRadius: 6, maxBarThickness: 26 },
                  ],
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
                  scales: { y: { ticks: { callback: (v) => (v >= 10000 ? `${v / 10000}만` : v) } } },
                }} />
              </div>
            )}
          </div>
          {stats.byCategory.length > 0 && (
            <div className="card">
              <h3>분류별 지출</h3>
              <div className="legend-list">
                {stats.byCategory.map((c, i) => (
                  <div className="legend-row" key={c.name}>
                    <span className="sw" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="lname">{c.name}</span>
                    <span className="lval">{fmtWon(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'members' && (
        <div className="card">
          <h3>멤버 ({members.length})</h3>
          {members.map((m) => (
            <div className="list-item" key={m.user_id}>
              <div className="li-main">
                <div style={{ fontWeight: 600 }}>{m.display_name}
                  {m.role === 'owner' && <span className="badge admin" style={{ marginLeft: 6 }}>총무</span>}
                </div>
                <div className="small muted">@{m.username}</div>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button className="btn sm ghost" style={{ color: 'var(--expense)' }} onClick={() => removeMember(m)}>제거</button>
              )}
            </div>
          ))}
          {isOwner && (
            <form onSubmit={addMember} style={{ marginTop: 14 }}>
              <label className="small muted">멤버 추가 (아이디)</label>
              <div className="row" style={{ marginTop: 6 }}>
                <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="추가할 사용자 아이디"
                  style={{ flex: 1, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }} />
                <button className="btn primary">추가</button>
              </div>
              {err && <p className="error" style={{ marginTop: 6 }}>{err}</p>}
            </form>
          )}
          {isOwner && (
            <button className="btn danger block" style={{ marginTop: 16 }} onClick={deleteGroup}>그룹 삭제</button>
          )}
        </div>
      )}

      {modal && (
        <Modal title={modal.tx ? '그룹 항목 수정' : '그룹 항목 추가'} onClose={() => setModal(null)}>
          <TransactionForm initial={modal.tx} groupId={gid}
            onSaved={() => { setModal(null); loadTxs(); loadStats(); }}
            onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
