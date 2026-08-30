import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFound() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Página no encontrada</CardTitle>
      </CardHeader>
      <CardContent>
        <Link href="/" className="text-sm underline">
          Volver al inicio
        </Link>
      </CardContent>
    </Card>
  );
}
