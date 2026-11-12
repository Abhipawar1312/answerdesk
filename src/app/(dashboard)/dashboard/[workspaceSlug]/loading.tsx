export default function WorkspaceLoading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="h-28 rounded border border-border bg-card p-4" />
        <div className="h-28 rounded border border-border bg-card p-4" />
        <div className="h-28 rounded border border-border bg-card p-4" />
      </div>
      <div className="h-48 rounded border border-border bg-muted/20" />
    </div>
  );
}

