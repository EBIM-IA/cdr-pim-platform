import type { Metadata } from 'next';
import Image from 'next/image';

import { SharedCatalogView } from './shared-catalog-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Catálogo compartido',
  description: 'Consulta y descarga el catálogo PDF compartido por Casa del Rulimán.',
  robots: { index: false, follow: false, nocache: true },
};

export default function SharedCatalogPage() {
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8 sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-[760px]">
        <header className="mb-7 flex flex-wrap items-center gap-4">
          <div className="rounded-xl bg-[#1b1f23] px-5 py-3">
            <Image
              src="/brand/cdr-logo.png"
              alt="Casa del Rulimán"
              width={208}
              height={63}
              priority
              className="h-auto w-[156px]"
            />
          </div>
          <p className="text-sm text-muted-foreground">Catálogo PDF compartido</p>
        </header>
        <SharedCatalogView />
        <footer className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Casa del Rulimán · La disponibilidad del catálogo depende de su vigencia y del enlace
          compartido.
        </footer>
      </div>
    </main>
  );
}
