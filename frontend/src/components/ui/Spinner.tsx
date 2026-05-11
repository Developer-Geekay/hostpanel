interface SpinnerProps { size?: number; }

export function Spinner({ size = 18 }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="spinner"
    >
      <path d="M12 2a10 10 0 1 0 10 10" />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <Spinner size={24} />
    </div>
  );
}
