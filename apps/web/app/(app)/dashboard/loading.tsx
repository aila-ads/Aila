/** Placeholder while the dashboard loads on the server. */
export default function DashboardLoading() {
  return (
    <div className="grid gap-8" aria-busy="true">
      <p role="status" className="sr-only">
        Loading your dashboard…
      </p>
      <div className="h-9 w-64 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
