export default function Loading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="h-8 w-32 bg-surface rounded-lg mb-2 animate-pulse" />
      <div className="h-4 w-64 bg-surface rounded mb-8 animate-pulse" />
      <div className="rounded-xl border border-surface-3 overflow-hidden">
        <div className="h-10 bg-surface-2 animate-pulse" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 border-t border-surface-3 bg-surface animate-pulse" />
        ))}
      </div>
    </div>
  );
}
