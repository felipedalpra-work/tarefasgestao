export default function Loading() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="h-4 w-20 bg-surface rounded mb-6 animate-pulse" />
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-surface animate-pulse" />
        <div>
          <div className="h-7 w-48 bg-surface rounded mb-2 animate-pulse" />
          <div className="h-4 w-36 bg-surface rounded animate-pulse" />
        </div>
      </div>
      <div className="h-12 bg-surface rounded-xl mb-6 animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-surface rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
