import { cn } from "@/lib/utils";

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn(
        "bg-skeleton rounded animate-pulse",
        className
      )}
      style={style}
    />
  );
}

export function PageSkeleton({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        {title ? (
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
        ) : (
          <Skeleton className="h-8 w-48 mb-2" />
        )}
        {subtitle ? (
          <p className="text-ink-mid mt-1 text-sm">{subtitle}</p>
        ) : (
          <Skeleton className="h-4 w-32 mt-2" />
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-8 w-28 mb-2" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="flex gap-4 flex-1">
        {[...Array(4)].map((_, col) => (
          <div key={col} className="flex-shrink-0 w-72 flex flex-col gap-2">
            <Skeleton className="h-8 rounded-lg mb-1" />
            {[...Array(3 - (col % 2))].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-36 rounded" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="space-y-2">
        {[...Array(rows)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" style={{ opacity: 1 - i * 0.07 }} />
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="p-6 flex flex-col h-full">
      <div className="mb-5">
        <Skeleton className="h-7 w-44 mb-1" />
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-7 w-36 rounded-lg" />
          <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-14 rounded-lg" />
      </div>
      <div className="grid grid-cols-7 mb-1 gap-px">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-6 rounded" />
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 gap-px bg-skeleton rounded-xl overflow-hidden">
        {[...Array(35)].map((_, i) => (
          <div key={i} className="bg-bg p-2 min-h-[90px]">
            <Skeleton className="h-5 w-5 rounded-full mb-2" />
            {i % 5 === 2 && <Skeleton className="h-10 rounded" />}
            {i % 7 === 3 && <Skeleton className="h-10 rounded" />}
          </div>
        ))}
      </div>
    </div>
  );
}
