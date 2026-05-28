import { Skeleton } from "@/components/ui/skeleton";

const METRIC_CARD_COUNT = 4;
const TABLE_ROW_COUNT = 5;

export function ServiceHealthSkeleton() {
  return (
    <div className="space-y-6 animate-slide-in" aria-busy="true" aria-label="Loading service health">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: METRIC_CARD_COUNT }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-lg p-5"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["w-24", "w-16", "w-28", "w-24", "w-16", "w-20"].map((w) => (
                <th key={w} className="text-left px-5 py-3">
                  <Skeleton className={`h-3 ${w}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: TABLE_ROW_COUNT }).map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Skeleton className="h-5 w-20 rounded-full" />
                </td>
                <td className="px-5 py-3">
                  <Skeleton className="h-4 w-16" />
                </td>
                <td className="px-5 py-3">
                  <Skeleton className="h-4 w-20" />
                </td>
                <td className="px-5 py-3">
                  <Skeleton className="h-4 w-12" />
                </td>
                <td className="px-5 py-3">
                  <Skeleton className="h-4 w-24" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
