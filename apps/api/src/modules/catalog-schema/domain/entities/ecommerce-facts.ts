import { createHash } from 'node:crypto';
import type { ProductSalesVariantDto } from '@cdr/contracts';
import type { TemplateAttribute } from './catalog-schema';
export function ecommerceFacts(
  variant: ProductSalesVariantDto,
  columns: readonly TemplateAttribute[],
  values: Readonly<Record<string, unknown>>,
  category: string,
  sourceKeys?: readonly string[],
) {
  const attributes = columns
    .filter(
      (a) =>
        a.publishable && a.sourceAuthority !== 'erp' && (!sourceKeys || sourceKeys.includes(a.key)),
    )
    .flatMap((a) => {
      const value = values[a.key];
      return value === null || value === undefined || value === ''
        ? []
        : [{ key: a.key, label: a.label, value, unit: a.unit }];
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    recordType: 'ecommerce_product_facts',
    instructionVersion: 'cdr-ecommerce-1',
    codigo: variant.codigoArticulo,
    marca: variant.marca,
    nombre: [category, variant.marca, variant.codigoArticulo].filter(Boolean).join(' '),
    tipo: variant.tipo,
    aplicacion: variant.aplicacion,
    categoria: category,
    atributos: attributes,
  };
}
export const ecommerceFingerprint = (facts: ReturnType<typeof ecommerceFacts>) =>
  createHash('sha256').update(JSON.stringify(facts)).digest('hex');
export const ecommerceVariantKey = (variant: ProductSalesVariantDto) =>
  `${variant.tipo}:${variant.aplicacion?.id ?? 'industrial'}`;
