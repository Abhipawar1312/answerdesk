'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Globe, Plus, Trash2, Check, Copy, Shield, Gauge, CreditCard, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateAllowedOriginsAction, updateWidgetDisplaySettingsAction } from '@/actions/settings';
import { createCheckoutSessionAction, createCustomerPortalAction } from '@/actions/billing';
import { isValidAllowedOrigin } from '@/lib/origins';
import { useWorkspaceUsage } from '@/components/dashboard/dashboard-shell';

const emptySubscribe = () => () => {};
const getClientOrigin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://answerdesk.app');
const getServerOrigin = () => 'https://answerdesk.app';

interface SettingsClientProps {
  workspaceSlug: string;
  workspaceName?: string;
  allowedOrigins: string[];
  hideCitationsInWidget?: boolean;
  plan: 'free' | 'pro';
  monthlyMessageCount: number;
  messageLimit: number;
}

export function SettingsClient({
  workspaceSlug,
  allowedOrigins: initialOrigins,
  hideCitationsInWidget: initialHideCitations = false,
  plan: initialPlan,
  monthlyMessageCount: initialMonthlyMessageCount,
  messageLimit: initialMessageLimit,
}: SettingsClientProps) {
  // Synchronized single source of truth shared with dashboard sidebar
  const usage = useWorkspaceUsage();
  const monthlyMessageCount = usage?.monthlyMessageCount ?? initialMonthlyMessageCount;
  const messageLimit = usage?.messageLimit ?? initialMessageLimit;
  const plan = (usage?.plan ?? initialPlan) as 'free' | 'pro';

  // Request fresh server usage on mount
  useEffect(() => {
    usage?.refreshUsage?.();
  }, [usage]);
  const [origins, setOrigins] = useState<string[]>(initialOrigins);
  const [hideCitations, setHideCitations] = useState(initialHideCitations);
  const [isSavingDisplay, setIsSavingDisplay] = useState(false);
  const [displaySuccess, setDisplaySuccess] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const handleBillingAction = async () => {
    setIsBillingLoading(true);
    setBillingError(null);
    try {
      if (plan === 'free') {
        const res = await createCheckoutSessionAction(workspaceSlug);
        if (res.success && res.url) {
          window.location.href = res.url;
        } else {
          setBillingError(res.error || 'Failed to start checkout.');
        }
      } else {
        const res = await createCustomerPortalAction(workspaceSlug);
        if (res.success && res.url) {
          window.location.href = res.url;
        } else {
          setBillingError(res.error || 'Failed to open billing portal.');
        }
      }
    } catch {
      setBillingError('An unexpected error occurred contacting the payment server.');
    } finally {
      setIsBillingLoading(false);
    }
  };

  const usagePercent =
    messageLimit > 0
      ? Math.min(100, Math.round((monthlyMessageCount / messageLimit) * 100))
      : 0;

  const handleAddOrigin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newOrigin.trim();
    if (!trimmed) return;

    const validation = isValidAllowedOrigin(trimmed);
    if (!validation.valid || !validation.normalized) {
      setErrorMessage(validation.error || 'Invalid origin format.');
      return;
    }

    const normalized = validation.normalized;
    if (origins.includes(normalized)) {
      setErrorMessage('This domain is already in your allowed list.');
      return;
    }

    setOrigins((prev) => [...prev, normalized]);
    setNewOrigin('');
    setErrorMessage(null);
  };

  const handleRemoveOrigin = (indexToRemove: number) => {
    setOrigins((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveOrigins = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const res = await updateAllowedOriginsAction(workspaceSlug, origins);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to save allowed origins.');
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch {
      setErrorMessage('An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDisplaySettings = async () => {
    setIsSavingDisplay(true);
    setDisplaySuccess(false);

    try {
      const res = await updateWidgetDisplaySettingsAction(workspaceSlug, hideCitations);
      if (res.success) {
        setDisplaySuccess(true);
        setTimeout(() => setDisplaySuccess(false), 3000);
      }
    } finally {
      setIsSavingDisplay(false);
    }
  };

  const origin = useSyncExternalStore(emptySubscribe, getClientOrigin, getServerOrigin);
  const embedSnippet = `<script\n  src="${origin}/widget.js"\n  data-workspace="${workspaceSlug}"\n  async>\n</script>`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="pb-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Shield className="h-4 w-4" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Workspace Settings
          </h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 ml-10">
          Manage embedding security, configure domain allowlists, and monitor plan message quotas.
        </p>
      </div>

      {/* Plan Usage & Limits Card */}
      <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Subscription & Message Quota</h2>
              <span className="text-[10px] font-mono text-muted-foreground">
                Billing environment: Live & Stripe Webhooks active
              </span>
            </div>
          </div>
          <span className="uppercase text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {plan} Tier
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Monthly Customer Messages</span>
            <span className="font-mono text-xs font-semibold text-foreground">
              {monthlyMessageCount} / {messageLimit} ({usagePercent}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                usagePercent >= 90 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.max(3, usagePercent)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/60">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {plan === 'free'
              ? 'Free tier includes 100 customer messages per month. Upgrade to Pro for 2,500 messages, 50 document slots, and custom branding.'
              : 'Pro tier active with 2,500 monthly messages and 50 knowledge base slots.'}
          </p>
          <Button
            size="sm"
            onClick={handleBillingAction}
            disabled={isBillingLoading}
            className="text-xs shrink-0 sm:ml-4 flex items-center gap-1.5 h-8.5 px-4 rounded-xl font-medium shadow-2xs"
          >
            {isBillingLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Connecting...
              </>
            ) : plan === 'free' ? (
              <>
                <CreditCard className="w-3.5 h-3.5" />
                Upgrade to Pro
              </>
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5" />
                Manage Billing
              </>
            )}
          </Button>
        </div>

        {billingError && (
          <p className="text-xs text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 font-medium">
            {billingError}
          </p>
        )}
      </div>

      {/* Allowed Origins (Security) */}
      <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Allowed Domain Allowlist (CORS & CSP)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Restrict iframe framing to authorized websites only to prevent quota theft.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddOrigin} className="flex gap-2">
          <Input
            value={newOrigin}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewOrigin(e.target.value)}
            placeholder="e.g. https://mycompany.com or sub.example.com"
            className="text-xs h-9 bg-background"
          />
          <Button type="submit" size="sm" variant="outline" className="text-xs shrink-0 h-9 rounded-xl border-border/80 shadow-2xs font-medium">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Domain
          </Button>
        </form>

        {origins.length === 0 ? (
          <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-500 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">
                Empty allowlist: embedding on external websites is restricted in production.
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                In production, an empty allowlist serves <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/60 text-foreground">frame-ancestors &apos;self&apos;</code>. To allow your website to embed this widget in production, add your domain above.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {origins.map((originItem, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20 text-xs shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-primary" />
                  <span className="font-mono text-foreground font-medium">{originItem}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveOrigin(idx)}
                  className="h-7 w-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  aria-label={`Remove origin ${originItem}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {errorMessage && (
          <p className="text-xs text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 font-medium">
            {errorMessage}
          </p>
        )}

        {saveSuccess && (
          <p className="text-xs text-emerald-500 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 flex items-center gap-1.5 font-medium">
            <Check className="w-3.5 h-3.5" /> Allowed origins updated successfully.
          </p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <span className="text-[11px] text-muted-foreground">
            Changes take effect immediately on new widget loads.
          </span>
          <Button
            size="sm"
            onClick={handleSaveOrigins}
            disabled={isSaving}
            className="text-xs min-w-28 h-8.5 rounded-xl font-medium shadow-2xs"
          >
            {isSaving ? (
              'Saving...'
            ) : saveSuccess ? (
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-500" /> Saved
              </span>
            ) : (
              'Save Origins'
            )}
          </Button>
        </div>
      </div>

      {/* Widget Display & Privacy Settings */}
      <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Widget Source Citation Excerpts</h2>
            <p className="text-xs text-muted-foreground">
              By default, visitors can click citations to view 120-character excerpts. Enable this to hide snippets and protect sensitive internal text.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSaveDisplaySettings}
            disabled={isSavingDisplay}
            className="text-xs min-w-28 h-8.5 rounded-xl font-medium shadow-2xs shrink-0 ml-4"
          >
            {isSavingDisplay ? (
              'Saving...'
            ) : displaySuccess ? (
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-500" /> Saved
              </span>
            ) : (
              'Save Display'
            )}
          </Button>
        </div>

        <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border/70 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors">
          <input
            type="checkbox"
            checked={hideCitations}
            onChange={(e) => setHideCitations(e.target.checked)}
            className="rounded border-border text-primary focus:ring-0 w-4 h-4"
          />
          <div className="text-xs">
            <span className="font-semibold text-foreground block">Hide document text snippets in public widget</span>
            <span className="text-muted-foreground">Only document titles will appear as references without raw body excerpts.</span>
          </div>
        </label>

        {displaySuccess && (
          <p className="text-xs text-emerald-500 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 flex items-center gap-1.5 font-medium">
            <Check className="w-3.5 h-3.5" /> Display settings saved successfully.
          </p>
        )}
      </div>

      {/* Embed Code Snippet Card */}
      <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Embed HTML Script Tag</h2>
            <p className="text-xs text-muted-foreground">
              Paste this HTML snippet right before the closing &lt;/body&gt; tag on your website.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopySnippet}
            className="text-xs flex items-center gap-1.5 h-8.5 rounded-xl border-border/80 shadow-2xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className={copied ? 'text-emerald-500 font-medium' : ''}>{copied ? 'Copied!' : 'Copy Code'}</span>
          </Button>
        </div>

        <pre className="p-4 rounded-xl bg-muted/40 text-foreground text-xs font-mono overflow-x-auto border border-border/60 leading-relaxed shadow-inner">
          <code suppressHydrationWarning>{embedSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
