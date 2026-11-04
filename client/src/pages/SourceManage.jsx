import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { fmtNum } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DayCardRow } from '../components/TransactionList.jsx';

const isCardGroup = (t) => t === 'credit' || t === 'check';

// admin=true: 관리자 > 기타 관리 > 원천 기본값 관리(새 가입자에게 만들어 줄 원천)
export default function SourceManage({ admin = false }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const api = admin ? {
    list: () => db.listDefaultSources(),
    add: (name, parentId, groupType) => db.addDefaultSource(name, parentId, groupType),
    update: (id, name, groupType) => db.updateDefaultSource(id, name, groupType),
    remove: (id) => db.deleteDefaultSource(id),
    setPrimary: (id, kind, value) => db.setDefaultPrimarySource(id, kind, value),
  } : {
    list: () => db.listSources(),
    add: (name, parentId, groupType) => db.addSource(user.id, name, parentId, groupType),
    update: (id, name, groupType) => db.updateSource(id, name, groupType),
    remove: (id) => db.deleteSource(id),
    setPrimary: (id, kind, value) => db.setPrimarySource(id, kind, value),
  };
  const [sources, setSources] = useState([]);
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 카드만 스와이프로 열려 있도록

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => api.list().then(({ tree }) => setSources(tree)).catch((e) => alert(e.message)), [admin]);
  useEffect(() => { load(); }, [load]);

  const wrap = (p) => p.catch((e) => alert(e.message));

  // 추가/수정은 별도 페이지(SourceEdit)
  const base = admin ? '/admin/defaults/sources' : '/settings/sources';
  const openAddCat = () => nav(`${base}/new`);
  const openAddItem = (top) => nav(`${base}/${top.id}/new`);
  const openEditor = (src) => nav(`${base}/${src.id}/edit`);
  const delCat = async (s) => {
    if (!confirm(`'${s.name}'${s.children?.length ? ' 및 하위 항목' : ''}을(를) 삭제할까요?`)) return;
    await wrap(api.remove(s.id)); setOpenId(null); load();
  };
  const delItem = async (it) => {
    if (!confirm(`'${it.name}'을(를) 삭제할까요?`)) return;
    await wrap(api.remove(it.id)); setOpenId(null); load();
  };
  const nameOf = (sid) => { for (const t of sources) { if (t.id === sid) return t.name; const c = (t.children || []).find((x) => x.id === sid); if (c) return c.name; } return ''; };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={admin ? '원천 기본값 관리' : '원천 관리'} flat right={
        <button className="tb-icon-btn" onClick={openAddCat} aria-label="원천 그룹 추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      {sources.map((top) => {
        // 그룹 카드 + 세부 항목 카드(+ 세부 항목 추가 줄)를 가계부 같은 날짜 카드처럼 이어 붙임.
        // 각 카드는 누르면 수정 모달, 왼쪽으로 밀면 삭제 버튼.
        const children = top.children || [];
        const count = 1 + children.length;
        return (
          <div className="tx-daygroup" style={{ marginTop: 14 }} key={top.id}>
            <DayCardRow
              index={0} count={count} clickable
              isOpen={openId === top.id} onOpenChange={(open) => setOpenId(open ? top.id : null)}
              onTap={() => openEditor(top)} onDelete={() => delCat(top)}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.75, fontWeight: 700, color: 'var(--k-tx-191722)', padding: '2px 0 2px 2px' }}>
                {/* 그룹명 + 그룹 특성(일반 제외, 회색 가는 작은 글씨) — 글자 아래쪽(기준선) 맞춤 */}
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  {top.name}
                  {(isCardGroup(top.group_type) || top.group_type === 'onnuri') && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>{{ credit: '신용카드', check: '체크카드', onnuri: '디지털 온누리' }[top.group_type]}</span>
                  )}
                </span>
                <PrimaryBadges src={top} />
              </span>
              <button aria-label="세부 항목 추가" onClick={(e) => { e.stopPropagation(); openAddItem(top); }} className="row-icon-btn">
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </DayCardRow>

            {children.map((it, i) => (
              <DayCardRow
                key={it.id} index={i + 1} count={count} clickable
                isOpen={openId === it.id} onOpenChange={(open) => setOpenId(open ? it.id : null)}
                onTap={() => openEditor(it)} onDelete={() => delItem(it)}
              >
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.25, fontWeight: 500, color: 'var(--k-tx-4a4652)', paddingLeft: 16 }}>
                  {it.name}
                  <PrimaryBadges src={it} />
                </span>
                {/* 상세: 일반 항목은 금액, 카드 항목은 연결 계좌·납부일(회색 작은 글씨) */}
                {!admin && (isCardGroup(top.group_type) ? (
                  (it.linked_source_id || it.payment_day) ? (
                    <span style={{ flex: 'none', fontSize: 11, color: 'var(--k-tx-a29ead)', whiteSpace: 'nowrap' }}>
                      {[it.linked_source_id ? nameOf(it.linked_source_id) : '', it.payment_day ? `매달 ${it.payment_day}일` : ''].filter(Boolean).join(' · ')}
                    </span>
                  ) : null
                ) : it.current_balance != null ? (
                  <span style={{ flex: 'none', fontSize: 12.5, fontWeight: 600, color: 'var(--k-tx-6c6779)', whiteSpace: 'nowrap' }}>{fmtNum(it.current_balance)}</span>
                ) : null)}
              </DayCardRow>
            ))}

          </div>
        );
      })}

    </div>
  );
}

const PrimaryBadges = ({ src }) => (
  <>
    {src.is_primary_payment && <span style={{ fontSize: 9, fontWeight: 700, color: '#2CDDB9', background: '#E5FBF6', borderRadius: 999, padding: '2px 6px' }}>주결제</span>}
    {src.is_primary_deposit && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF8A00', background: '#FFF1DC', borderRadius: 999, padding: '2px 6px' }}>주입금</span>}
  </>
);
