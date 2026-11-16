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
        Pega evidencia del fabricante. La IA propone afijos pendientes; revisa sus citas y confianza
        antes de validarlos.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          Marca
          <input
            className="mt-1 block w-full rounded border p-2"
            value={brand}
            maxLength={120}
            onChange={(event) => setBrand(event.target.value)}
          />
        </label>
        <label className="text-xs">
          Familia
          <input
            className="mt-1 block w-full rounded border p-2"
            value={family}
            maxLength={120}
            onChange={(event) => setFamily(event.target.value)}
          />
        </label>
      </div>
      <label className="block text-xs">
        Evidencia documental
        <textarea
          className="mt-1 block min-h-28 w-full rounded border p-2"
          maxLength={30000}
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || evidence.trim().length < 30}
          onClick={async () => {
            setBusy(true);
            setError('');
            setNotice('');
            try {
              const result = await bootstrapCodeAffixes({
                evidence,
                ...(brand.trim() ? { brand: brand.trim() } : {}),
                ...(family.trim() ? { family: family.trim() } : {}),
              });
              setNotice(
                `${result.items.length} sugerencias guardadas; ${result.skipped} descartadas.${result.simulated ? ' Proveedor simulado: no se inventan sugerencias.' : ''}`,
              );
              onSaved();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'No se pudo cargar.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Proponer afijos con IA
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
