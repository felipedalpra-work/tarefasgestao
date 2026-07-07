export default function Loading() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="h-8 w-32 bg-surface rounded-lg mb-2 animate-pulse" />
      <div className="h-4 w-64 bg-surface rounded mb-8 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface border border-surface-3 rounded-xl p-5 animate-pulse">
            <div className="w-10 h-10 rounded-lg bg-surface-3 mb-4" />
            <div className="h-4 bg-surface-3 rounded w-3/4 mb-3" />
            <div className="h-3 bg-surface-3 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
