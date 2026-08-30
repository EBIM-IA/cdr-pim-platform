'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Route-level error boundary.
 *
 * Shows the user something actionable and — importantly — the digest, which is what ties a
 * screenshot from a user back to the server log entry. It never renders the raw error
 * message, which can contain internal hostnames.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled UI error', { digest: error.digest });
  }, [error]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Algo salió mal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No fue posible completar la operación. Si el problema persiste, comparte esta referencia
          con el equipo técnico.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">referencia: {error.digest}</p>
        ) : null}
        <Button onClick={reset} size="sm">
          Reintentar
        </Button>
      </CardContent>
    </Card>
  );
}
