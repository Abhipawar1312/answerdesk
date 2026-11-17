'use client';

import { useState, useSyncExternalStore } from 'react';
import { Code2, Copy, Check, ExternalLink, Smartphone, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const emptySubscribe = () => () => {};
const getClientOrigin = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  return typeof window !== 'undefined' ? window.location.origin : 'https://answerdesk-ai.vercel.app';
};
const getServerOrigin = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  return 'https://answerdesk-ai.vercel.app';
};

interface WidgetPreviewClientProps {
  workspaceSlug: string;
  workspaceName: string;
  allowedOrigins?: string[];
}

export function WidgetPreviewClient({
  workspaceSlug,
  workspaceName,
  allowedOrigins = [],
}: WidgetPreviewClientProps) {
  const [copied, setCopied] = useState(false);

  const appOrigin = useSyncExternalStore(emptySubscribe, getClientOrigin, getServerOrigin);
  const embedCode = `<!-- AnswerDesk AI Support Chat Widget -->\n<script\n  src="${appOrigin}/widget.js"\n  data-workspace="${workspaceSlug}"\n  async>\n</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="pb-4 border-b border-border">
        <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Code2 className="w-5 h-5 text-muted-foreground" />
          Embed Widget
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Deploy your AI support assistant to any website with a single line of JavaScript.
        </p>
      </div>

      {(!allowedOrigins || allowedOrigins.length === 0) && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">
              Empty allowlist: embedding on external websites is restricted in production.
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              In production, an empty allowlist serves <code className="font-mono text-[10px]">frame-ancestors &apos;self&apos;</code>, which prevents other websites from embedding your widget and consuming your message quota (direct links to <code className="font-mono text-[10px]">/widget/{workspaceSlug}</code> continue to work). In development, it remains open (<code className="font-mono text-[10px]">* &apos;self&apos;</code>). To allow your website to embed this widget in production, configure your domain in Settings.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Embed Instructions & Code */}
        <div className="lg:col-span-7 space-y-6">
          {/* Script Snippet Card */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Standard Script Tag</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="h-8 text-xs flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy Snippet'}
              </Button>
            </div>
            <pre className="p-3.5 rounded-lg bg-muted text-foreground text-xs font-mono overflow-x-auto border border-border/60">
              <code suppressHydrationWarning>{embedCode}</code>
            </pre>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste this snippet right before the closing <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">&lt;/body&gt;</code> tag on your marketing pages, documentation site, or app.
            </p>
          </div>

          {/* Quick Integration Guides */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Integration Notes</h2>
            <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="font-semibold text-foreground block mb-0.5">React / Next.js:</span>
                Use the <code className="font-mono text-[11px]">&lt;Script strategy=&quot;afterInteractive&quot; ... /&gt;</code> tag in your root layout.
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="font-semibold text-foreground block mb-0.5">WordPress / Webflow / Shopify:</span>
                Paste into your site&apos;s custom code / footer injection setting.
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="font-semibold text-foreground block mb-0.5">Direct Link:</span>
                You can also open the widget directly in a browser tab at:{' '}
                <a
                  href={`/widget/${workspaceSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary underline inline-flex items-center gap-1"
                >
                  /widget/{workspaceSlug} <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Mockup Preview */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[360px] space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1 font-medium">
                <Smartphone className="w-3.5 h-3.5" /> Live Widget Preview
              </span>
              <span>{workspaceName}</span>
            </div>

            <div className="w-full h-[540px] rounded-2xl border-2 border-border bg-background shadow-xl overflow-hidden flex flex-col">
              <iframe
                src={`/widget/${workspaceSlug}`}
                title="Widget Preview"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

