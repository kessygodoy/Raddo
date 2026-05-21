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
      <path
        d="M64 22a42 42 0 0 1 29.7 12.3L81.6 46.4A25 25 0 0 0 39 64c0 10 5.9 18.7 14.4 22.7V107A43.2 43.2 0 0 1 64 22Z"
        fill="#ff1744"
      />
      <path
        d="M100.4 42.8A42 42 0 0 1 74.6 106.7V86.5A25 25 0 0 0 88.7 54.4Z"
        fill="#ff1744"
      />
      <path d="M58.8 86.9h10.4V107H58.8Z" fill="#ff1744" />
      <circle cx="64" cy="64" fill="#ff1744" r="17" />
    </svg>
  );
}
