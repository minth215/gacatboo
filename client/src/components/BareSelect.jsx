// 투명 select 를 덮은 "글자 + ▾" 선택(테두리 없음)
// groups: [{ label, options: [[value, label]] }] 로 주면 optgroup 으로 묶어 보여 줌. placeholder: 값이 없을 때 회색 글자
export default function BareSelect({ value, options = [], groups = null, onChange, disabled, placeholder = '' }) {
  const all = groups ? groups.flatMap((g) => g.options) : options;
  const label = all.find(([v]) => String(v) === String(value))?.[1] ?? '';
  const empty = !label;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 13.25, color: empty ? 'var(--k-tx-a29ead)' : 'var(--k-tx-191722)', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label || placeholder}</span>
      <svg width="11" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
      <select
        value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', padding: 0, margin: 0, cursor: 'pointer' }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {groups
          ? groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </optgroup>
          ))
          : options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}
