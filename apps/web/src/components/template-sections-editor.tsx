'use client';
import { useEffect, useState } from 'react';
import type { AdminTemplateDto, TemplateSectionDto } from '@cdr/contracts';
import { updateAdminTemplateSections } from '@/lib/catalog-admin-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function TemplateSectionsEditor({
  template,
  disabled,
  onSaved,
}: {
  template: AdminTemplateDto;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [sections, setSections] = useState<TemplateSectionDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setSections([...(template.sections ?? [])].sort((a, b) => a.position - b.position));
    setNotice(null);
  }, [template.id, template.updatedAt, template.sections]);
  const move = (index: number, direction: number) =>
    setSections((current) => {
      const next = [...current];
      const other = index + direction;
      if (!next[other]) return current;
      [next[index], next[other]] = [next[other]!, next[index]!];
      return next;
    });
  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await updateAdminTemplateSections(template.id, {
        sections: sections.map((section, position) => ({ ...section, position })),
        expectedUpdatedAt: template.updatedAt,
      });
      onSaved();
      setNotice('Secciones guardadas y auditadas. La ficha y el PDF usan este orden.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No fue posible guardar las secciones.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="mb-4 p-4">
      <h3 className="text-sm font-semibold">Secciones de la ficha</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Define su nombre y orden; asigna cada atributo desde la columna Sección. Se aplican a todos
        los perfiles y al PDF.
      </p>
      <ol className="my-3 grid gap-2">
        {sections.map((section, index) => (
          <li key={section.key} className="flex items-center gap-2">
            <span>{index + 1}.</span>
            <Input
              aria-label={`Nombre de sección ${index + 1}`}
              value={section.label}
              disabled={disabled || saving}
              maxLength={200}
              onChange={(event) =>
                setSections((current) =>
                  current.map((item) =>
                    item.key === section.key ? { ...item, label: event.target.value } : item,
                  ),
                )
              }
            />
            <Button
              size="sm"
              variant="outline"
              aria-label={`Subir ${section.label}`}
              disabled={disabled || saving || index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Bajar ${section.label}`}
              disabled={disabled || saving || index === sections.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={
                disabled ||
                saving ||
                template.attributes?.some((attribute) => attribute.sectionKey === section.key)
              }
              onClick={() =>
                setSections((current) => current.filter((item) => item.key !== section.key))
              }
            >
              Quitar
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || saving || sections.length >= 100}
          onClick={() =>
            setSections((current) => [
              ...current,
              {
                key: `section_${crypto.randomUUID().replaceAll('-', '')}`,
                label: 'Nueva sección',
                position: current.length,
              },
            ])
          }
        >
          Agregar sección
        </Button>
        <Button
          size="sm"
          disabled={disabled || saving || sections.some((section) => !section.label.trim())}
          onClick={() => void save()}
        >
          {saving ? 'Guardando…' : 'Guardar secciones'}
        </Button>
      </div>
      {notice ? (
        <p role="status" className="mt-2 text-xs">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}
