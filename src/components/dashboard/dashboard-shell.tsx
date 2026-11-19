'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { signOutAction } from '@/actions/auth';
import {
  FileText,
  MessageSquare,
  Code2,
  Settings,
  LayoutDashboard,
  HelpCircle,
  LogOut,
  User,
  Menu,
  X,
} from 'lucide-react';

interface DashboardShellProps {
  workspace: {
    name: string;
    slug: string;
    plan: string;
    monthlyMessageCount: number;
    messageLimit: number;
  };
  sessionUser?: {
    name?: string | null;
    email?: string | null;
  };
  children: React.ReactNode;
}

export interface WorkspaceUsageContextValue {
  monthlyMessageCount: number;
  messageLimit: number;
  plan: string;
  refreshUsage: () => Promise<void>;
}

export const WorkspaceUsageContext = React.createContext<WorkspaceUsageContextValue | null>(null);

export function useWorkspaceUsage() {
  return React.useContext(WorkspaceUsageContext);
}

export function DashboardShell({
  workspace,
  sessionUser,
  children,
}: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = React.useState(pathname);

  // Live usage state synced with server
  const [liveUsage, setLiveUsage] = React.useState({
    monthlyMessageCount: workspace.monthlyMessageCount,
    messageLimit: workspace.messageLimit,
    plan: workspace.plan,
  });

  // Adjust state during render when props change (standard React pattern)
  const [prevUsageProps, setPrevUsageProps] = React.useState({
    monthlyMessageCount: workspace.monthlyMessageCount,
    messageLimit: workspace.messageLimit,
    plan: workspace.plan,
  });
  if (
    prevUsageProps.monthlyMessageCount !== workspace.monthlyMessageCount ||
    prevUsageProps.messageLimit !== workspace.messageLimit ||
    prevUsageProps.plan !== workspace.plan
  ) {
    setPrevUsageProps({
      monthlyMessageCount: workspace.monthlyMessageCount,
      messageLimit: workspace.messageLimit,
      plan: workspace.plan,
    });
    setLiveUsage({
      monthlyMessageCount: workspace.monthlyMessageCount,
      messageLimit: workspace.messageLimit,
      plan: workspace.plan,
    });
  }

  // Fetch fresh usage from server per request / route navigation
  const refreshUsage = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspace.slug}/usage`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setLiveUsage({
          monthlyMessageCount: data.monthlyMessageCount,
          messageLimit: data.messageLimit,
          plan: data.plan,
        });
      }
    } catch {
      // Ignore network errors
    }
  }, [workspace.slug]);

  // Refresh usage asynchronously on soft navigation / route changes
  React.useEffect(() => {
    let active = true;
    const fetchUsage = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.slug}/usage`, {
          cache: 'no-store',
        });
        if (res.ok && active) {
          const data = await res.json();
          setLiveUsage({
            monthlyMessageCount: data.monthlyMessageCount,
            messageLimit: data.messageLimit,
            plan: data.plan,
          });
        }
      } catch {
        // Ignore network errors
      }
    };
    fetchUsage();
    return () => {
      active = false;
    };
  }, [pathname, workspace.slug]);

  // Close mobile drawer on route change (adjust state during render)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Single source of truth for workspace usage across all dashboard pages & sidebar
  const usageValue = React.useMemo(
    () => ({
      monthlyMessageCount: liveUsage.monthlyMessageCount,
      messageLimit: liveUsage.messageLimit,
      plan: liveUsage.plan,
      refreshUsage,
    }),
    [liveUsage.monthlyMessageCount, liveUsage.messageLimit, liveUsage.plan, refreshUsage]
  );

  // Lock background scroll when mobile drawer is open
  React.useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const navItems = [
    {
      label: 'Overview',
      href: `/dashboard/${workspace.slug}`,
      icon: LayoutDashboard,
    },
    {
      label: 'Documents',
      href: `/dashboard/${workspace.slug}/documents`,
      icon: FileText,
    },
    {
      label: 'Test Chat',
      href: `/dashboard/${workspace.slug}/chat`,
      icon: MessageSquare,
    },
    {
      label: 'Conversations',
      href: `/dashboard/${workspace.slug}/conversations`,
      icon: MessageSquare,
    },
    {
      label: 'Unanswered',
      href: `/dashboard/${workspace.slug}/unanswered`,
      icon: HelpCircle,
    },
    {
      label: 'Embed Widget',
      href: `/dashboard/${workspace.slug}/widget`,
      icon: Code2,
    },
    {
      label: 'Settings',
      href: `/dashboard/${workspace.slug}/settings`,
      icon: Settings,
    },
  ];

  const renderNavList = (onNavigate?: () => void) => (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === `/dashboard/${workspace.slug}`
            ? pathname === item.href
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
              isActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const renderSidebarFooter = () => (
    <div className="space-y-3 pt-4 border-t border-border/80">
      {/* Monthly Messages Quota */}
      <div className="rounded-xl border border-border/80 bg-muted/30 p-3 shadow-xs">
        <div className="flex items-center justify-between text-[11px] mb-2 gap-1.5 whitespace-nowrap">
          <span className="text-muted-foreground whitespace-nowrap font-medium">Monthly Messages</span>
          <span className="font-mono text-foreground font-semibold whitespace-nowrap shrink-0">
            {liveUsage.monthlyMessageCount} / {liveUsage.messageLimit}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all rounded-full"
            style={{
              width: `${Math.min(
                100,
                liveUsage.messageLimit > 0
                  ? (liveUsage.monthlyMessageCount / liveUsage.messageLimit) * 100
                  : 0
              )}%`,
            }}
          />
        </div>
      </div>

      {/* User info & Signout */}
      <div className="pt-1 flex flex-col gap-1.5 border-t border-border/50">
        <div className="flex items-center gap-2 px-1 py-0.5">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0 border border-border">
            <User className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate leading-tight">
              {sessionUser?.name || 'User'}
            </p>
            {sessionUser?.email && (
              <p className="text-[10px] text-muted-foreground truncate leading-tight">
                {sessionUser.email}
              </p>
            )}
          </div>
        </div>

        <form action={signOutAction} className="w-full">
          <button
            type="submit"
            className="flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <WorkspaceUsageContext.Provider value={usageValue}>
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Desktop Sidebar (hidden on mobile, visible on md and up) */}
        <aside className="hidden md:flex md:w-56 md:flex-col justify-between p-4 bg-card border-r border-border shrink-0">
          <div>
            {/* Workspace Identity */}
            <div className="flex items-center justify-between pb-4 border-b border-border/80 mb-4">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold shadow-xs">
                  {workspace.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold truncate text-foreground leading-tight">
                    {workspace.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate leading-tight">
                    Workspace
                  </span>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider ${
                workspace.plan === 'pro'
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
                {workspace.plan}
              </span>
            </div>

            {renderNavList()}
          </div>

          {renderSidebarFooter()}
        </aside>

        {/* Mobile Drawer (visible only when mobileMenuOpen is true on small screens) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-out drawer */}
            <div className="relative w-64 max-w-[85vw] bg-card border-r border-border p-4 flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-foreground text-[10px] font-bold text-background">
                      {workspace.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-xs font-semibold truncate text-foreground">
                      {workspace.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Close navigation menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {renderNavList(() => setMobileMenuOpen(false))}
              </div>

              {renderSidebarFooter()}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 w-full">
          {/* Top Header */}
          <header className="h-14 border-b border-border flex items-center justify-between px-4 sm:px-6 bg-background sticky top-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              {/* Hamburger button for phones */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                <span className="hidden sm:inline">Workspace</span>
                <span className="hidden sm:inline">/</span>
                <span className="text-foreground font-medium truncate">{workspace.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <ThemeToggle />
            </div>
          </header>

          {/* Responsive Content Container */}
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto min-w-0 w-full max-w-full">
            {children}
          </main>
        </div>
      </div>
    </WorkspaceUsageContext.Provider>
  );
}

