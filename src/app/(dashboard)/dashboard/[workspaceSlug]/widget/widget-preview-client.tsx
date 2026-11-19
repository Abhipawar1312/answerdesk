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
      <div className="pb-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Code2 className="h-4 w-4" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Embed Widget
          </h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 ml-10">
          Install the AI customer support widget on your website or web app with a single copy-paste script tag.
        </p>
      </div>

      {(!allowedOrigins || allowedOrigins.length === 0) && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-500 text-xs shadow-2xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">
              Empty allowlist: embedding on external websites is restricted in production.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              In production, an empty allowlist serves <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/60 text-foreground">frame-ancestors &apos;self&apos;</code>, which prevents other websites from embedding your widget and consuming your message quota (direct links to <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/60 text-foreground">/widget/{workspaceSlug}</code> continue to work). In development, it remains open. To allow your production website to embed this widget, add your domain in Settings.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Embed Instructions & Code */}
        <div className="lg:col-span-7 space-y-6">
          {/* Script Snippet Card */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Standard HTML Script Tag</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Works on any HTML, WordPress, Webflow, or Shopify site.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="h-8.5 text-xs flex items-center gap-1.5 rounded-xl border-border/80 shadow-2xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                <span className={copied ? 'text-emerald-500 font-medium' : ''}>{copied ? 'Copied to Clipboard' : 'Copy Snippet'}</span>
              </Button>
            </div>
            <pre className="p-4 rounded-xl bg-muted/40 text-foreground text-xs font-mono overflow-x-auto border border-border/60 leading-relaxed shadow-inner">
              <code suppressHydrationWarning>{embedCode}</code>
            </pre>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste this snippet right before the closing <code className="text-xs font-mono bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/60 text-foreground">&lt;/body&gt;</code> tag on pages where you want the chat bubble to appear.
            </p>
          </div>

          {/* Quick Integration Guides */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-4 shadow-xs">
            <h2 className="text-sm font-semibold text-foreground">Platform Integration Notes</h2>
            <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50">
                <span className="font-semibold text-foreground block mb-0.5">React / Next.js Frameworks:</span>
                Use the <code className="font-mono text-[11px] bg-muted/60 px-1 py-0.5 rounded text-foreground">&lt;Script strategy=&quot;afterInteractive&quot; ... /&gt;</code> component in your root layout.
              </div>
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50">
                <span className="font-semibold text-foreground block mb-0.5">WordPress / Webflow / Squarespace:</span>
                Paste into your site&apos;s custom code / footer injection setting in your theme or project dashboard.
              </div>
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50">
                <span className="font-semibold text-foreground block mb-0.5">Direct Hosted Link:</span>
                You can also open the widget directly in a browser tab or share via email:{' '}
                <a
                  href={`/widget/${workspaceSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline inline-flex items-center gap-1 font-medium mt-1"
                >
                  /widget/{workspaceSlug} <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Mockup Preview */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[360px] space-y-2.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <Smartphone className="w-3.5 h-3.5 text-primary" /> Live Widget Preview
              </span>
              <span className="font-mono text-[11px]">{workspaceName}</span>
            </div>

            <div className="w-full h-[540px] rounded-3xl border-4 border-border/80 bg-background shadow-2xl overflow-hidden flex flex-col ring-1 ring-border/20">
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

