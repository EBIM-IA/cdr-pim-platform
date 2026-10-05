'use client';

import { LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginFailureMessage } from '@/lib/auth';

interface LoginFormProps {
  returnTo: string;
}

export function LoginForm({ returnTo }: LoginFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError('');

    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          returnTo,
        }),
      });
      if (!response.ok) {
        setError(loginFailureMessage(response.status));
        return;
      }

      const body: unknown = await response.json().catch(() => null);
      const redirectTo =
        body && typeof body === 'object' && 'redirectTo' in body ? String(body.redirectTo) : '/';
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError('No fue posible conectar con el servicio. Inténtalo nuevamente.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="mt-8 space-y-5" onSubmit={submit} noValidate>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground" htmlFor="email">
          Correo electrónico
        </label>
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="correo@empresa.com"
            className="h-12 pl-10"
            required
            disabled={pending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground" htmlFor="password">
          Contraseña
        </label>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-12 pl-10"
            required
            disabled={pending}
          />
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true" className="min-h-6">
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
        {pending ? 'Validando acceso…' : 'Iniciar sesión'}
      </Button>
    </form>
  );
}
