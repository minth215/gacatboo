import { useState } from 'react';

// 할부 기록 삭제 시 선택: "할부 기록 전체 삭제" / "할부 선결제(이후 회차 삭제)" — 이 회차 포함 이후 회차를
// 지우고 그 금액을 앞 회차에 더함(중도 상환).
// 1회차는 어차피 전체가 지워지므로 모달 대신 알림 후 전체 삭제.
// const [askInstallmentDelete, installmentDeleteEl] = useInstallmentDeleteChoice();
// const choice = await askInstallmentDelete(t) // 'all' | 'after' | null(취소)
export function useInstallmentDeleteChoice() {
  const [req, setReq] = useState(null); // { resolve }
  const ask = (t) => {
    if (t?.installment_no === 1) return Promise.resolve(confirm('할부 기록 전체가 삭제됩니다.') ? 'all' : null);
    return new Promise((resolve) => setReq({ resolve }));
  };
  const close = (v) => { req?.resolve(v); setReq(null); };
  const btn = (primary) => ({
    width: '100%', height: 44, border: 'none', borderRadius: 999, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer',
    background: primary ? 'var(--k-bg-191722)' : 'var(--k-bg-f4f2f0)', color: primary ? 'var(--k-onink-fff)' : 'var(--k-tx-191722)',
  });
  const el = req ? (
    <div className="catmodal-overlay" onClick={() => close(null)}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" style={btn(true)} onClick={() => close('all')}>할부 기록 전체 삭제</button>
          <button type="button" style={btn(false)} onClick={() => close('after')}>할부 선결제(이후 회차 삭제)</button>
        </div>
      </div>
    </div>
  ) : null;
  return [ask, el];
}
