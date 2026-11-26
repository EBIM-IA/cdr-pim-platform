'use client';
import { useState } from 'react';
import type { CodeAffixDto } from '@cdr/contracts';
import { bootstrapCodeAffixes } from '@/lib/ai-api';
import { bulkValidateCodeAffixes } from '@/lib/code-affix-api';
import { Button } from './ui/button';
import { Card } from './ui/card';
export function CodeAffixBootstrap({
  rules,
  onSaved,
}: {
  rules: CodeAffixDto[];
  onSaved: () => void;
}) {
  const [source, setSource] = useState<'catalog' | 'document'>('catalog');
  const [evidence, setEvidence] = useState(''),
    [brand, setBrand] = useState(''),
    [family, setFamily] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const eligible = rules.filter(
    (rule) =>
      rule.active &&
      rule.status === 'pending_validation' &&
      rule.source === 'ai_suggestion' &&
      (rule.confidence ?? 0) >= 0.9 &&
      rule.evidence,
  );
  return (
    <Card className="p-5 space-y-3">
      <h3 className="text-sm font-semibold">Carga inicial con IA</h3>
      <p className="text-xs text-muted-foreground">
        Revisa los ejemplos y la confianza de cada sugerencia antes de validarla.
      </p>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-xs" disabled={busy}>
        <legend className="mb-1 font-medium">Fuente de evidencia</legend>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="code-affix-source"
            checked={source === 'catalog'}
            onChange={() => setSource('catalog')}
          />
          Códigos del catálogo
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="code-affix-source"
            checked={source === 'document'}
            onChange={() => setSource('document')}
          />
          Evidencia del fabricante
        </label>
      </fieldset>
      {source === 'catalog' ? (
        <p className="text-xs text-muted-foreground">
          Analiza una muestra de códigos de artículo, proveedor y homólogos aprobados.
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          Marca (opcional)
          <input
            className="mt-1 block w-full rounded border p-2"
            value={brand}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setBrand(event.target.value)}
          />
        </label>
        {source === 'document' ? (
          <label className="text-xs">
            Familia (opcional)
            <input
              className="mt-1 block w-full rounded border p-2"
              value={family}
              maxLength={120}
              disabled={busy}
              onChange={(event) => setFamily(event.target.value)}
            />
          </label>
        ) : null}
      </div>
      {source === 'document' ? (
        <label className="block text-xs">
          Evidencia documental
          <textarea
            className="mt-1 block min-h-28 w-full rounded border p-2"
            maxLength={30000}
            value={evidence}
            disabled={busy}
            onChange={(event) => setEvidence(event.target.value)}
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || (source === 'document' && evidence.trim().length < 30)}
          onClick={async () => {
            setBusy(true);
            setError('');
            setNotice('');
            try {
              const scope = brand.trim() ? { brand: brand.trim() } : {};
              const result = await bootstrapCodeAffixes(
                source === 'catalog'
                  ? { source: 'catalog', ...scope }
                  : { evidence, ...scope, ...(family.trim() ? { family: family.trim() } : {}) },
              );
              const sample = result.sample;
              setNotice(
                [
                  sample
                    ? `Muestra del catálogo (${sample.sku} de artículo, ${sample.provider} de proveedor, ${sample.homolog} homólogos).`
                    : '',
                  `${result.items.length} sugerencias guardadas y ${result.skipped} descartadas.`,
                  result.simulated ? 'Proveedor de IA simulado.' : '',
                ]
                  .filter(Boolean)
                  .join(' '),
              );
              onSaved();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'No se pudo cargar.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {source === 'catalog' ? 'Analizar códigos con IA' : 'Proponer afijos con IA'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !eligible.length}
          onClick={async () => {
            setBusy(true);
            setError('');
            setNotice('');
            try {
              const result = await bulkValidateCodeAffixes({
                items: eligible
                  .slice(0, 100)
                  .map((rule) => ({ id: rule.id, expectedUpdatedAt: rule.updatedAt })),
              });
              setNotice(`${result.items.length} reglas validadas con decisión humana.`);
              if (result.errors.length)
                setError(result.errors.map((value) => value.message).join(' '));
              onSaved();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'No se pudo validar.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Validar {Math.min(eligible.length, 100)} sugerencias revisadas ≥ 90 %
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-xs">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}
