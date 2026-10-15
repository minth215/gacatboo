import { useState } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';

function Toggle({ on, onClick, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ios-toggle${on ? ' on' : ''}`} onClick={onClick}>
      <span className="ios-toggle-knob" />
    </button>
  );
}

// 내보내기 범위 목록: key → 화면 라벨/설명 + 실제로 가져올 데이터
const SCOPES = [
  { key: 'ledger', label: '가계부', desc: '개인 가계부 내역 전체' },
  { key: 'groups', label: '그룹', desc: '소속된 그룹과 멤버 정보' },
  { key: 'recurring', label: '반복 관리', desc: '등록된 반복 수입/지출 규칙' },
  { key: 'friends', label: '친구 관리', desc: '친구 분류 및 등록된 친구 목록' },
  { key: 'incomeCategories', label: '수입 분류', desc: '수입 분류 목록' },
  { key: 'expenseCategories', label: '지출 분류', desc: '지출 분류 목록' },
  { key: 'budgets', label: '예산 관리', desc: '분류별 예산 설정' },
  { key: 'sources', label: '원천 관리', desc: '현금·은행·카드 등 원천 자산' },
  { key: 'cardBenefits', label: '카드 실적 관리', desc: '카드별 실적 구간 혜택 설정' },
];

export default function SettingsExport() {
  const { user } = useAuth();
  const [scopes, setScopes] = useState(() => Object.fromEntries(SCOPES.map((s) => [s.key, true])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (key) => setScopes((prev) => ({ ...prev, [key]: !prev[key] }));

  const exportData = async () => {
    const selected = SCOPES.filter((s) => scopes[s.key]).map((s) => s.key);
    if (!selected.length) return setErr('내보낼 범위를 하나 이상 선택하세요.');
    setBusy(true); setErr('');
    try {
      const data = {};
      if (scopes.ledger) data.transactions = await db.listAllPersonalTransactions(user.id);
      if (scopes.groups) {
        const { groups, group_members } = await db.listMyGroupsExport();
        data.groups = groups; data.group_members = group_members;
      }
      if (scopes.recurring) data.recurring_rules = await db.listAllRecurringRules();
      if (scopes.friends) {
        data.friend_groups = await db.listFriendGroups();
        data.friends = await db.listFriends();
      }
      if (scopes.incomeCategories) data.income_categories = await db.listCategories('income');
      if (scopes.expenseCategories) data.expense_categories = await db.listCategories('expense');
      if (scopes.budgets) data.category_budgets = await db.listAllCategoryBudgets();
      if (scopes.sources) data.sources = (await db.listSources()).flat;
      if (scopes.cardBenefits) data.card_benefit_tiers = await db.listCardBenefits();

      const payload = { app: 'gacatboo', version: 1, exported_at: new Date().toISOString(), exported_by: user.id, scopes: selected, data };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `가캣부_백업_${today().replace(/-/g, '')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '40px 0 32px' }}>
      <PageHeader title="내보내기" flat />

      <div className="tx-daycard" style={{ marginTop: 14 }}>
        {SCOPES.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{s.label}</div>
              <div style={{ marginTop: 2, fontSize: 11.5, color: '#a29ead' }}>{s.desc}</div>
            </div>
            <Toggle on={!!scopes[s.key]} onClick={() => toggle(s.key)} label={s.label} />
          </div>
        ))}
      </div>

      {err && <p className="error" style={{ marginTop: 14 }}>{err}</p>}

      <button type="button" className="btn-ink-pill" style={{ marginTop: 20 }} disabled={busy} onClick={exportData}>
        {busy ? '내보내는 중…' : '내보내기'}
      </button>
    </div>
  );
}
