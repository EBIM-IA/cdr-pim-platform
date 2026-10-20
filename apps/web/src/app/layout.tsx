import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CDR PIM',
    template: '%s · CDR PIM',
  },
  description: 'Catálogo maestro de productos de Casa del Rulimán.',
  icons: {
    icon: [{ url: '/brand/cdr-favicon.png', type: 'image/png', sizes: '96x96' }],
    shortcut: '/brand/cdr-favicon.png',
    apple: '/brand/cdr-favicon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ea5b0c',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-EC" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
