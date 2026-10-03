// 웹 푸시 구독 관리. VAPID 공개키는 비밀값이 아니라(서버가 보낸 푸시가 이 키 쌍으로 서명됐는지
// 브라우저가 검증하는 용도) 클라이언트 코드에 그대로 둬도 안전함. 개인키는 서버(Edge Function)에만 둔다.
export const VAPID_PUBLIC_KEY = 'BBni0SbdGd9a6SeST_CgnJTtuBbkfOqR32Oh0yp4ibpM-KgBKygRs4_9KZWrToKNpbmGBPsjp1iaGY7b0u3Jgxw';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window;

// 알림 권한 요청 → 서비스워커 준비 대기 → 푸시 구독. 실패 시 이유를 담은 Error를 던진다.
export async function subscribePush() {
  if (!pushSupported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한이 거부되었습니다.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return sub.toJSON();
}

// 이 기기의 구독을 해제(브라우저 쪽). DB의 push_subscriptions 행 삭제는 호출부에서 별도 처리.
export async function unsubscribePush() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const json = sub.toJSON();
  await sub.unsubscribe();
  return json;
}
