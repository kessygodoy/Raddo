type RaddoMarkProps = {
  className?: string;
  showTile?: boolean;
};

export default function RaddoMark({ className = 'h-10 w-10' }: RaddoMarkProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      src="/raddo-icon.png"
    />
  );
}
