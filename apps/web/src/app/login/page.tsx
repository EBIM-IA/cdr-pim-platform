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
    <main className="grid min-h-dvh bg-white md:grid-cols-2">
      <section className="hidden items-center justify-center bg-[#1b1f23] px-12 py-14 text-white md:flex">
        <div className="w-[min(510px,90%)] text-center">
          <Image
            src="/brand/cdr-logo.png"
            alt="Casa del Rulimán"
            width={520}
            height={158}
            priority
            className="mx-auto h-auto w-[min(320px,85%)]"
          />
          <h1 className="mx-auto my-[26px] max-w-[410px] text-balance text-[29px] font-medium leading-[1.12]">
            Un catálogo más inteligente para un futuro ganador.
          </h1>
          <p className="text-[11px] text-white/70">
            Plataforma interna PIM · información de productos confiable
          </p>
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-9 sm:px-10 md:px-9">
        <div className="w-full max-w-[390px]">
          <Image
            src="/brand/cdr-logo.png"
            alt="Casa del Rulimán"
            width={520}
            height={158}
            className="mb-6 h-auto w-[150px] rounded-lg bg-[#1b1f23] px-3 py-2 md:hidden"
          />
          <h2 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h2>
          <p className="mt-1 text-left text-xs leading-relaxed text-muted-foreground">
            Ingresa para acceder al catálogo de productos.
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
