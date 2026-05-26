type RaddoMarkProps = {
  className?: string;
  showTile?: boolean;
};

export default function RaddoMark({ className = 'h-10 w-10', showTile = false }: RaddoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="raddo-icon-shadow" colorInterpolationFilters="sRGB" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="8" floodColor="#000000" floodOpacity=".28" stdDeviation="7" />
        </filter>
      </defs>
      {showTile && <rect fill="rgba(255,255,255,.06)" height="128" rx="30" width="128" />}
      <g filter="url(#raddo-icon-shadow)">
        <circle cx="64" cy="64" fill="#ff4446" r="52" />
        <path
          d="M78.5 40.5A31.5 31.5 0 1 1 45.2 91.7L39.5 98l2.2-15.5A31.5 31.5 0 0 1 50 38.6"
          fill="none"
          stroke="#151c1f"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="13"
        />
        <circle cx="64" cy="64" fill="#151c1f" r="10.5" />
        <circle cx="45" cy="42" fill="#151c1f" r="7" />
      </g>
    </svg>
  );
}
