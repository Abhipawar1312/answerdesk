export default function DashboardLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        <span className="text-xs text-muted-foreground font-mono">Loading workspace...</span>
      </div>
    </div>
  );
}

