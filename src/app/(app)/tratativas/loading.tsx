export default function Loading() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="h-8 w-40 bg-surface rounded-lg mb-2 animate-pulse" />
      <div className="h-4 w-72 bg-surface rounded mb-8 animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-surface border border-surface-3 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
