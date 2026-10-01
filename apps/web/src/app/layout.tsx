import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CDR PIM',
    template: '%s · CDR PIM',
  },
  description: 'Catálogo maestro de productos de Casa del Rulimán.',
  icons: { icon: '/brand/cdr-isotipo.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ff6903',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-EC" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
