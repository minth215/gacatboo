// 비밀번호 정책: 영문, 숫자를 모두 포함한 8자 이상
export const PASSWORD_HINT = '영문, 숫자 포함 8자 이상';

export function passwordPolicyError(pw) {
  if (pw.length < 8) return `비밀번호는 ${PASSWORD_HINT}로 설정해야 합니다.`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return `비밀번호는 ${PASSWORD_HINT}로 설정해야 합니다.`;
  return null;
}
