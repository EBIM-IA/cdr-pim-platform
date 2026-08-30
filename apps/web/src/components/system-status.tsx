import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError, createServerApiClient } from '@/lib/api-client';

/**
 * Walking-skeleton view.
 *
 * Renders the *live* state of the backend: the API's own liveness plus every readiness
 * check it performs (today: PostgreSQL). If this card is green, the whole vertical slice —
 * browser -> Next.js server component -> API client -> NestJS -> use case -> port ->
 * Drizzle adapter -> PostgreSQL — is working.
 */
export async function SystemStatus() {
  const client = createServerApiClient();

  try {
    const [liveness, readiness] = await Promise.all([client.health(), client.readiness()]);

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Estado del sistema</CardTitle>
            <Badge variant={readiness.status === 'up' ? 'success' : 'destructive'}>
              {readiness.status === 'up' ? 'operativo' : 'degradado'}
            </Badge>
          </div>
          <CardDescription>
            {liveness.service} · versión {liveness.version} · {liveness.uptimeSeconds}s en línea
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {readiness.checks.map((check) => (
              <li
                key={check.name}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{check.name}</span>
                <span className="flex items-center gap-3 text-muted-foreground">
                  {check.latencyMs !== undefined ? <span>{check.latencyMs} ms</span> : null}
                  <Badge variant={check.status === 'up' ? 'success' : 'destructive'}>
                    {check.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  } catch (error) {
    const detail =
      error instanceof ApiClientError
        ? `${error.code} (referencia ${error.correlationId ?? 'n/d'})`
        : 'sin respuesta';

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Estado del sistema</CardTitle>
            <Badge variant="destructive">sin conexión</Badge>
          </div>
          <CardDescription>La API no respondió: {detail}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Verifica que la API esté levantada:{' '}
          <code className="font-mono text-xs">docker compose up -d &amp;&amp; pnpm dev</code>
        </CardContent>
      </Card>
    );
  }
}
