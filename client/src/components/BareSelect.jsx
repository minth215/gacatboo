// 투명 select 를 덮은 "글자 + ▾" 선택(테두리 없음)
export default function BareSelect({ value, options, onChange, disabled }) {
  const label = options.find(([v]) => String(v) === String(value))?.[1] ?? '';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 13.25, color: 'var(--k-tx-191722)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{label}</span>
      <svg width="11" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
      <select
        value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', padding: 0, margin: 0, cursor: 'pointer' }}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}

