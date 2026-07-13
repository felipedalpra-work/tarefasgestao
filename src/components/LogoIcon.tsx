export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="9" />
      <circle cx="50" cy="50" r="25" stroke="currentColor" strokeWidth="9" />
    </svg>
  );
}
