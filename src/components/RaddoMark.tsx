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
      {showTile && <rect fill="rgba(255,255,255,.06)" height="128" rx="30" width="128" />}
      <circle cx="64" cy="64" fill="#ff3f3f" r="52" />
      <path
        d="M60 35A32 32 0 1 1 39 54"
        fill="none"
        stroke="#050707"
        strokeLinecap="round"
        strokeWidth="15.5"
      />
      <circle cx="64" cy="64" fill="#050707" r="12.5" />
      <circle cx="45" cy="45" fill="#050707" r="8.2" />
    </svg>
  );
}
