import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function NotFound() {
  return (
    <Card className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center p-8 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-full bg-orange-100 text-primary">
        <SearchX aria-hidden="true" className="size-7" />
      </span>
      <h1 className="text-2xl font-semibold">No encontramos esta pantalla</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        La ruta no existe o todavía no forma parte del frontend inicial del PIM.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Volver al inicio
        </Link>
      </Button>
    </Card>
  );
}
