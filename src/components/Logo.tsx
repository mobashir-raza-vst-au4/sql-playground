export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="sqlpg-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#sqlpg-logo)" />
      {/* database cylinder */}
      <rect x="8.5" y="9" width="15" height="14" fill="#fff" />
      <ellipse cx="16" cy="23" rx="7.5" ry="2.7" fill="#fff" />
      <ellipse cx="16" cy="9" rx="7.5" ry="2.7" fill="#fff" />
      {/* seams */}
      <path
        d="M8.5 13.7c0 1.5 3.36 2.7 7.5 2.7s7.5-1.2 7.5-2.7"
        stroke="#93c5fd"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d="M8.5 18.2c0 1.5 3.36 2.7 7.5 2.7s7.5-1.2 7.5-2.7"
        stroke="#93c5fd"
        strokeWidth="1.2"
        fill="none"
      />
      {/* run/play accent */}
      <circle cx="24" cy="23" r="5.2" fill="#8b5cf6" stroke="#fff" strokeWidth="1.4" />
      <path d="M22.4 20.9 L26.2 23 L22.4 25.1 Z" fill="#fff" />
    </svg>
  );
}
