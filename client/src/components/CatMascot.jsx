import { useId } from 'react';

// 놀깅 스타일 빼꼼 고양이 (시안 그대로). clip-path id 충돌 방지를 위해 인스턴스별 고유 id 사용.
export default function CatMascot({ width = 70, style }) {
  const raw = useId();
  const clip = `catShape-${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={width} viewBox="0 0 64 34" style={style} aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d="M6 34 A26 22 0 0 1 58 34 Z" />
          <path d="M8 27 L11.3 10 Q11.5 5.5 16 7.8 L30 17 Z" />
          <path d="M56 27 L52.7 10 Q52.5 5.5 48 7.8 L34 17 Z" />
        </clipPath>
      </defs>
      <path d="M6 34 A26 22 0 0 1 58 34 Z" fill="#fff" />
      <path d="M8 27 L11.3 10 Q11.5 5.5 16 7.8 L30 17 Z" fill="#fff" />
      <path d="M56 27 L52.7 10 Q52.5 5.5 48 7.8 L34 17 Z" fill="#fff" />
      <g style={{ clipPath: `url(#${clip})` }}>
        <path d="M11.3 10 Q11.5 5.5 16 7.8 C28 9 40 12 34 20 C28 30 16 36 6 30 C6 20 9 12 11.3 10 Z" fill="#f0a13d" />
        <path d="M52.7 10 Q52.5 5.5 48 7.8 C40 5 34 7 32 12 C38 22 48 30 64 32 C60 20 54 12 52.7 10 Z" fill="#191722" />
      </g>
      <g style={{ animation: 'cat-blink 4s infinite', transformOrigin: '23px 26px' }}>
        <circle cx="23" cy="26" r="6.5" fill="#ffd43b" /><circle cx="23.6" cy="26.6" r="4.6" fill="#191722" /><circle cx="20.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
      <g style={{ animation: 'cat-blink 4s infinite', transformOrigin: '41px 26px' }}>
        <circle cx="41" cy="26" r="6.5" fill="#ffd43b" /><circle cx="41.6" cy="26.6" r="4.6" fill="#191722" /><circle cx="38.6" cy="23.8" r="1.3" fill="#fff" />
      </g>
    </svg>
  );
}
