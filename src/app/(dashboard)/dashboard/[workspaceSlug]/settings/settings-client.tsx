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
      <div className="pb-4 border-b border-border">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Workspace Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure security, view plan quotas, and copy your embed code.
        </p>
      </div>

      {/* Plan Usage & Limits Card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Plan Usage & Message Limits</h2>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded border border-border text-muted-foreground bg-muted/60">
              Billing: Test Mode
            </span>
          </div>
          <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-foreground text-background">
            {plan} Plan
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Monthly Customer Messages</span>
            <span className="font-medium text-foreground">
              {monthlyMessageCount} / {messageLimit} ({usagePercent}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-foreground transition-all duration-300"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            {plan === 'free'
              ? 'Free plan includes 100 customer messages per month. Upgrade to Pro for 2,500 messages and 50 documents.'
              : 'Pro plan active with 2,500 monthly messages and 50 document slots.'}
          </p>
          <Button
            size="sm"
            onClick={handleBillingAction}
            disabled={isBillingLoading}
            className="text-xs shrink-0 ml-4 flex items-center gap-1.5"
          >
            {isBillingLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing...
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
          <p className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
            {billingError}
          </p>
        )}
      </div>

      {/* Allowed Origins (Security) */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Allowed Origins & Domains</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Restrict where your chat widget can be loaded. Leave empty to allow any domain (useful in development).
            </p>
          </div>
        </div>

        <form onSubmit={handleAddOrigin} className="flex gap-2">
          <Input
            value={newOrigin}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewOrigin(e.target.value)}
            placeholder="e.g. https://mycompany.com or sub.example.com"
            className="text-xs"
          />
          <Button type="submit" size="sm" variant="outline" className="text-xs shrink-0">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Domain
          </Button>
        </form>

        {origins.length === 0 ? (
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">
                Empty allowlist: embedding on external websites is restricted in production.
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                In production, an empty allowlist serves <code className="font-mono text-[10px]">frame-ancestors &apos;self&apos;</code>, which prevents other websites from embedding your widget and consuming your message quota (direct links to <code className="font-mono text-[10px]">/widget/{workspaceSlug}</code> continue to work). In development, it remains open (<code className="font-mono text-[10px]">* &apos;self&apos;</code>). To allow your website to embed this widget in production, add your domain above.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {origins.map((origin, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/30 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-mono text-foreground">{origin}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveOrigin(idx)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove origin ${origin}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {errorMessage && (
          <p className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
            {errorMessage}
          </p>
        )}

        {saveSuccess && (
          <p className="text-xs text-emerald-500 bg-emerald-500/10 p-2.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Allowed origins saved successfully.
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-muted-foreground">
            Changes take effect immediately on new widget loads.
          </span>
          <Button
            size="sm"
            onClick={handleSaveOrigins}
            disabled={isSaving}
            className="text-xs min-w-24"
          >
            {isSaving ? (
              'Saving...'
            ) : saveSuccess ? (
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            ) : (
              'Save Origins'
            )}
          </Button>
        </div>
      </div>

      {/* Widget Display & Privacy Settings */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Widget Citation Excerpts</h2>
            <p className="text-xs text-muted-foreground">
              By default, visitors can click citations to view 120-character excerpts. Enable this to hide snippets and protect sensitive internal text.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSaveDisplaySettings}
            disabled={isSavingDisplay}
            className="text-xs min-w-24 shrink-0 ml-4"
          >
            {isSavingDisplay ? (
              'Saving...'
            ) : displaySuccess ? (
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            ) : (
              'Save Display'
            )}
          </Button>
        </div>

        <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer">
          <input
            type="checkbox"
            checked={hideCitations}
            onChange={(e) => setHideCitations(e.target.checked)}
            className="rounded border-border text-foreground focus:ring-0 w-4 h-4"
          />
          <div className="text-xs">
            <span className="font-medium text-foreground block">Hide document text snippets in public widget</span>
            <span className="text-muted-foreground">Only document titles will appear as references without raw body excerpts.</span>
          </div>
        </label>

        {displaySuccess && (
          <p className="text-xs text-emerald-500 bg-emerald-500/10 p-2.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Display settings saved successfully.
          </p>
        )}
      </div>

      {/* Embed Code Snippet Card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Embed Script Code</h2>
            <p className="text-xs text-muted-foreground">
              Paste this HTML snippet right before the closing &lt;/body&gt; tag on your website.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopySnippet}
            className="text-xs flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </Button>
        </div>

        <pre className="p-3.5 rounded-lg bg-muted text-foreground text-xs font-mono overflow-x-auto border border-border/60">
          <code suppressHydrationWarning>{embedSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
