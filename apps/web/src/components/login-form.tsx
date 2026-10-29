'use client';

import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginFailureMessage } from '@/lib/auth';

interface LoginFormProps {
  returnTo: string;
}

export function LoginForm({ returnTo }: LoginFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setHydrated(true);
  }, []);

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
    <form method="post" className="mt-4" onSubmit={submit}>
      <div className="my-4">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="email">
          Correo electrónico
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="correo@casadelruliman.ec"
          className="h-10 rounded-md text-xs"
          required
          disabled={pending || !hydrated}
        />
      </div>

      <div className="my-4">
        <label
          className="mb-1.5 block text-xs font-medium text-muted-foreground"
          htmlFor="password"
        >
          Contraseña
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="h-10 rounded-md text-xs"
          required
          disabled={pending || !hydrated}
        />
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error ? (
          <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        className="mt-2 h-10 w-full rounded-md text-xs"
        disabled={pending || !hydrated}
      >
        {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
        {pending ? 'Validando acceso…' : 'Iniciar sesión'}
      </Button>
    </form>
  );
}
