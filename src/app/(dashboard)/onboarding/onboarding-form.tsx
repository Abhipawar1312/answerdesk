'use client';

import { useActionState } from 'react';
import { createWorkspaceAction, type CreateWorkspaceState } from '@/actions/workspace';
import { Button } from '@/components/ui/button';

const initialState: CreateWorkspaceState = {};

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(createWorkspaceAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-xs font-medium text-foreground mb-1">
          Workspace Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Acme Support"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
        />
        {state.fieldErrors?.name && (
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            {state.fieldErrors.name[0]}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="slug" className="block text-xs font-medium text-foreground mb-1">
          Workspace URL Slug
        </label>
        <div className="flex items-center rounded border border-input bg-muted/20 px-3">
          <span className="text-xs text-muted-foreground">/dashboard/</span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            placeholder="acme-support"
            className="w-full bg-transparent py-1.5 pl-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden"
          />
        </div>
        {state.fieldErrors?.slug && (
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            {state.fieldErrors.slug[0]}
          </p>
        )}
      </div>

      {state.error && (
        <div className="rounded border border-border bg-muted/30 p-2 text-xs text-foreground">
          {state.error}
        </div>
      )}

      <div className="pt-2">
        <Button type="submit" disabled={isPending} className="w-full text-xs">
          {isPending ? 'Creating workspace...' : 'Continue to Dashboard'}
        </Button>
      </div>
    </form>
  );
}

