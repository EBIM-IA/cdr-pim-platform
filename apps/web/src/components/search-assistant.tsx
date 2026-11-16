'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { AiSearchAssistantResponse } from '@cdr/contracts';
import { askSearchAssistant } from '@/lib/ai-api';
import { Button } from './ui/button';
import { Input } from './ui/input';
export function SearchAssistant({ query, productIds }: { query: string; productIds?: string[] }) {
  const [question, setQuestion] = useState(
    '¿Qué información registrada ayuda a elegir este producto?',
  );
  const [answer, setAnswer] = useState<AiSearchAssistantResponse | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="mt-4 space-y-3">
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            setAnswer(await askSearchAssistant({ query, question, productIds }));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo consultar el asistente.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-xs">
          Pregunta sobre los resultados
          <Input
            className="mt-1"
            value={question}
            maxLength={1000}
            minLength={2}
            disabled={busy}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <Button size="sm" disabled={busy || question.trim().length < 2}>
          {busy ? 'Consultando…' : 'Consultar asistente'}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {answer ? (
        <div className="space-y-2">
          <p role="status" className="whitespace-pre-line text-sm">
            {answer.answer}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {answer.simulated ? 'Proveedor simulado' : 'Proveedor configurado'} · {answer.model}
          </p>
          <div className="flex flex-wrap gap-2">
            {answer.sources.map((source) => (
              <Link
                key={source.productId}
                href={`/products/${source.productId}`}
                className="text-xs text-primary underline"
              >
                {source.sku}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        El asistente consulta evidencia del catálogo y registra la referencia de los SKU utilizados.
      </p>
    </div>
  );
}
