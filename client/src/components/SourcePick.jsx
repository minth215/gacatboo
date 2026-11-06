import { depositableTree } from '../lib/sourceFilter.js';

// 원천 셀렉트(원천만, 원천 그룹은 라벨). excludeCards: 신용카드/체크카드 그룹은 "입금 허용"을 켠 원천만(입금·출금 계좌용)
export default function SourcePick({ tree, value, onChange, placeholder = '원천 선택', excludeCards = true, style }) {
  const groups = (excludeCards ? depositableTree(tree, value) : (tree || [])).filter((t) => t.children?.length);
  return (
    <select
      value={value || ''} onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: 'inherit', fontSize: 13.75, background: 'var(--k-bg-faf9f8)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14,
        padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none',
        color: value ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)', ...style,
      }}
    >
      <option value="">{placeholder}</option>
      {groups.map((t) => (
        <optgroup key={t.id} label={t.name}>
          {t.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
