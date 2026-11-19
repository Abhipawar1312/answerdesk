'use client';

import { useActionState } from 'react';
import { createWorkspaceAction, type CreateWorkspaceState } from '@/actions/workspace';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight } from 'lucide-react';

const initialState: CreateWorkspaceState = {};

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(createWorkspaceAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-xs font-medium text-foreground">
          Workspace Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="e.g. Acme Support"
          className="w-full rounded-xl border border-border/80 bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors shadow-2xs"
        />
        {state.fieldErrors?.name && (
          <p className="mt-1 text-xs text-rose-500 font-medium">
            {state.fieldErrors.name[0]}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="slug" className="block text-xs font-medium text-foreground">
          Workspace URL Identifier
        </label>
        <div className="flex items-center rounded-xl border border-border/80 bg-muted/20 px-3.5 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors shadow-2xs">
          <span className="text-xs font-mono text-muted-foreground select-none">/dashboard/</span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            placeholder="acme-support"
            className="w-full bg-transparent py-2 pl-1 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        {state.fieldErrors?.slug && (
          <p className="mt-1 text-xs text-rose-500 font-medium">
            {state.fieldErrors.slug[0]}
          </p>
        )}
      </div>

      {state.error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500 font-medium">
          {state.error}
        </div>
      )}

      <div className="pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="w-full text-xs h-9 rounded-xl font-medium flex items-center justify-center gap-1.5 shadow-2xs"
        >
          {isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Configuring workspace...</span>
            </>
          ) : (
            <>
              <span>Continue to Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

