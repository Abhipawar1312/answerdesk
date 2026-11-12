export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        <span className="text-xs text-muted-foreground font-mono">Loading setup...</span>
      </div>
    </div>
  );
}

