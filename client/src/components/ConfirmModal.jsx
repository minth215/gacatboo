// 브라우저 기본 confirm() 대신 쓰는 앱 내 확인 모달(네/아니요 버튼).
export default function ConfirmModal({ message, onYes, onNo, yesLabel = '네', noLabel = '아니요' }) {
  return (
    <div className="catmodal-overlay" onClick={onNo}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: '#191722', margin: '4px 2px 18px', whiteSpace: 'pre-line' }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={onNo}>{noLabel}</button>
          <button type="button" className="btn-ink-pill" style={{ flex: 1, marginTop: 0 }} onClick={onYes}>{yesLabel}</button>
        </div>
      </div>
    </div>
  );
}
