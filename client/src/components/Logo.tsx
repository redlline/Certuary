export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 140" aria-hidden="true">
      <path
        d="M60 0 L116 20 V70 C116 110 90 132 60 140 C30 132 4 110 4 70 V20 Z"
        fill="var(--accent)"
      />
      <g transform="translate(60,68)">
        <rect x="-18" y="-4" width="36" height="30" rx="6" fill="var(--bg)" />
        <path
          d="M-10 -4 V-16 C-10 -27 10 -27 10 -16 V-4"
          fill="none"
          stroke="var(--bg)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <circle cx="0" cy="10" r="5" fill="var(--accent)" />
      </g>
    </svg>
  );
}
