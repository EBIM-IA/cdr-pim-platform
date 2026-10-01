import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/login-form';
import { safeReturnTo } from '@/lib/auth';
import { getCurrentActor } from '@/lib/server-auth';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Acceso seguro al catálogo maestro de Casa del Rulimán.',
};

export const dynamic = 'force-dynamic';

interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const raw = (await searchParams).returnTo;
  const returnTo = safeReturnTo(Array.isArray(raw) ? raw[0] : raw);
  const actor = await getCurrentActor();
  if (actor) redirect(returnTo);

  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-cdr-ink px-12 py-16 text-white lg:flex lg:items-center lg:justify-center">
        <div
          aria-hidden="true"
          className="absolute -left-24 -top-24 size-80 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -right-24 size-96 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative max-w-lg text-center">
          <Image
            src="/brand/cdr-isotipo.svg"
            alt="Casa del Rulimán"
            width={152}
            height={132}
            priority
            className="mx-auto h-auto w-[142px]"
          />
          <h1 className="mt-8 text-balance text-4xl font-medium leading-tight tracking-tight">
            Un catálogo más inteligente para un futuro ganador.
          </h1>
          <p className="mt-6 text-sm text-white/65">
            Plataforma interna PIM · información de productos confiable
          </p>
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-[420px]">
          <Image
            src="/brand/cdr-isotipo.svg"
            alt="Casa del Rulimán"
            width={88}
            height={76}
            priority
            className="mb-10 h-auto w-20 rounded-xl bg-cdr-ink p-2 lg:hidden"
          />
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">CDR PIM</p>
          <h2 className="text-3xl font-semibold tracking-tight">Bienvenido</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Ingresa con tu cuenta autorizada para acceder al catálogo maestro.
          </p>
          <LoginForm returnTo={returnTo} />
          <p className="mt-8 text-center text-xs text-muted-foreground">
            El acceso y las acciones quedan sujetos a los permisos de tu rol.
          </p>
        </div>
      </section>
    </main>
  );
}
