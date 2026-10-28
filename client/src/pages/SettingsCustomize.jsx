import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import BareSelect from '../components/BareSelect.jsx';
import { useAuth } from '../lib/auth.jsx';
import { loadPrefs, savePrefs } from '../lib/prefs.js';

// 설정 > 가계부 커스터마이즈: 탭별 기본 상태. 각 줄 오른쪽 끝에 지금 값이 보이고,
// 누르면 셀렉트로 바꾼다(바꾸는 즉시 저장).
const ON_OFF = [['on', 'ON'], ['off', 'OFF']];
const SHOW_HIDE = [['show', '보기'], ['hide', '숨기기']];
const bool = (on, off) => ({ toSel: (v) => (v ? on : off), fromSel: (s) => s === on });

const SECTIONS = [
  {
    label: '가계부',
    rows: [
      { key: 'ledgerView', label: '기본 뷰', options: [['list', '리스트'], ['calendar', '캘린더']] },
      { key: 'quickMenu', label: '퀵 메뉴', options: [['none', '없음'], ['favorites', '즐겨찾기'], ['receipt', '영수증 자동 채우기']] },
      { key: 'recordFocus', label: '기록 순서', options: [['content', '내용'], ['amount', '금액']] },
      { key: 'ledgerSettle', label: '정산 반영', options: ON_OFF, ...bool('on', 'off') },
    ],
  },
  {
    label: '통계',
    rows: [
      { key: 'statsView', label: '기본 뷰', options: [['donut', '원형 그래프'], ['table', '테이블']] },
      { key: 'statsSettle', label: '분류별 통계 정산 반영', options: ON_OFF, ...bool('on', 'off') },
      { key: 'statsBudget', label: '예산', options: SHOW_HIDE, ...bool('show', 'hide') },
    ],
  },
  {
    label: '그룹',
    rows: [
      { key: 'groupShowEnded', label: '종료된 그룹', options: SHOW_HIDE, ...bool('show', 'hide') },
    ],
  },
];

export default function SettingsCustomize() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(() => loadPrefs(user?.id));

  const change = (row, sel) => {
    const value = row.fromSel ? row.fromSel(sel) : sel;
    setPrefs(savePrefs(user?.id, { [row.key]: value }));
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="가계부 커스터마이즈" flat />

      {SECTIONS.map((sec, si) => (
        <div key={sec.label}>
          <div className="settings-group-label" style={{ marginTop: si === 0 ? 18 : 26 }}>{sec.label}</div>
          <div className="tx-daycard">
            {sec.rows.map((row, i) => (
              <div
                key={row.key}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px', borderTop: i === 0 ? 'none' : '1.5px solid var(--k-divider)' }}
              >
                <span style={{ fontSize: 13.25, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{row.label}</span>
                <BareSelect
                  value={row.toSel ? row.toSel(prefs[row.key]) : prefs[row.key]}
                  options={row.options} onChange={(v) => change(row, v)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
