import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { PALETTE } from '../lib/chartSetup.js';
import { currentMonth, shiftMonth, monthLabel, fmtWon, isSubscription, leaderLabel } from '../lib/format.js';
import TransactionList from '../components/TransactionList.jsx';
import MembersPanel from '../components/MembersPanel.jsx';
import SubscriptionGroup from './SubscriptionGroup.jsx';

export default function GroupDetail() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);

  const loadGroup = useCallback(() => {
    db.getGroup(gid).then(({ group, members }) => { setGroup(group); setMembers(members); })
      .catch((e) => { alert(e.message); nav('/groups'); });
  }, [gid, nav]);
  useEffect(() => { loadGroup(); }, [loadGroup]);

  if (!group) return <div className="empty">불러오는 중…</div>;

  const isOwner = group.owner_id === user.id;
  const leaderName = leaderLabel(group.category);

  const header = (
    <>
      <button className="btn sm ghost" onClick={() => nav('/groups')} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 그룹 목록</button>
      <div className="card">
        <div className="between">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{group.name}</div>
            <div className="small muted" style={{ marginTop: 2 }}>{group.description || '설명 없음'}</div>
          </div>
          <span className="chip">{group.category_emoji ? `${group.category_emoji} ` : ''}{group.category}</span>
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>{leaderName} {group.owner_name} · 멤버 {members.length}명</div>
      </div>
    </>
  );

  if (isSubscription(group.category)) {
    return (
      <SubscriptionGroup
        gid={gid} group={group} members={members} isOwner={isOwner} leaderName={leaderName}
        header={header} reloadMembers={loadGroup} onDeletedGroup={() => nav('/groups')}
      />
    );
  }

  return <GenericGroup gid={gid} group={group} members={members} isOwner={isOwner} leaderName={leaderName} header={header} nav={nav} user={user} reloadMembers={loadGroup} />;
}

// ---------- 일반 그룹 (내역/통계/멤버) ----------
function GenericGroup({ gid, group, members, isOwner, leaderName, header, nav, user, reloadMembers }) {
  const [tab, setTab] = useState('ledger');
  const [month, setMonth] = useState(currentMonth());
  const [txs, setTxs] = useState([]);

  const loadTxs = useCallback(() => {
    db.listTransactions({ month, groupId: gid }).then(setTxs).catch(() => setTxs([]));
  }, [gid, month]);
  useEffect(() => { loadTxs(); }, [loadTxs]);

  const canEdit = (t) => t.created_by === user.id;
  const removeTx = async (t) => {
    if (!confirm('이 항목을 삭제할까요?')) return;
    try { await db.deleteTransaction(t.id); loadTxs(); } catch (e) { alert(e.message); }
  };
  const deleteGroup = async () => {
    if (!confirm('그룹을 삭제하면 그룹 내 모든 항목이 삭제됩니다. 계속할까요?')) return;
    try { await db.deleteGroup(gid); nav('/groups'); } catch (e) { alert(e.message); }
  };

  // 멤버별 통계용 이름 매핑
  const statMembers = members.map((m) => ({ user_id: m.user_id, display_name: m.nickname }));

  return (
    <div>
      {header}

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
          <TransactionList transactions={txs} canEdit={canEdit} onEdit={(t) => nav(`/tx/${t.id}`)} onDelete={removeTx} />
          <button className="fab" onClick={() => nav(`/new?group=${gid}`)} aria-label="추가">＋</button>
        </>
      )}

      {tab === 'stats' && (
        <GroupStatsView gid={gid} month={month} members={statMembers} />
      )}

      {tab === 'members' && (
        <>
          <MembersPanel groupId={gid} members={members} isOwner={isOwner} leaderName={leaderName} onReload={reloadMembers} />
          {isOwner && <button className="btn danger block" onClick={deleteGroup}>그룹 삭제</button>}
        </>
      )}
    </div>
  );
}

function GroupStatsView({ gid, month, members }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!members.length) { setStats(null); return; }
    db.groupStats(gid, month, members).then(setStats).catch(() => setStats(null));
  }, [gid, month, members]);
  if (!stats) return <div className="empty">데이터가 없습니다.</div>;
  return (
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
  );
}
