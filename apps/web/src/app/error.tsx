'use client';

import { useEffect } from 'react';

import { StatePanel } from '@/components/state-panel';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatePanel
      variant="error"
      title="No pudimos mostrar esta pantalla"
      description="Ocurrió un error inesperado en la interfaz. Intenta cargarla de nuevo."
      actionLabel="Reintentar"
      onAction={reset}
    />
  );
}
