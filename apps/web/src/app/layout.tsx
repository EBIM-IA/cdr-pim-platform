import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Casa del Rulimán · PIM',
  description: 'Catálogo Maestro de Productos con Inteligencia Artificial',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-EC" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <div>
              <p className="text-sm font-semibold">Casa del Rulimán</p>
              <p className="text-xs text-muted-foreground">Catálogo Maestro de Productos · PIM</p>
            </div>
            <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
              foundation
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
