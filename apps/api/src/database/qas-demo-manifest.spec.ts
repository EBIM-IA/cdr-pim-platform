import { describe, expect, it } from 'vitest';

import { CLIENT_TEMPLATE_MANIFEST } from './client-template-manifest';
import { buildQasDemoSupplement, QAS_DEMO_SOURCE, QAS_DEMO_SUPPLEMENT } from './qas-demo-manifest';

function product(sku: string) {
  const candidate = QAS_DEMO_SUPPLEMENT.products.find((item) => item.sku === sku);
  if (!candidate) throw new Error(`Missing illustrative product ${sku}`);
  return candidate;
}

describe('QAS designer demo supplement', () => {
  it('adds exactly the eight explicitly illustrative SKU without changing the canonical workbook', () => {
    const before = JSON.stringify(CLIENT_TEMPLATE_MANIFEST);
    const supplement = buildQasDemoSupplement();
    const canonical = CLIENT_TEMPLATE_MANIFEST.templates.flatMap((template) => template.products);
    expect(canonical).toHaveLength(97);
    expect(supplement.products.map((item) => item.sku)).toEqual([
      '6205-2RS1',
      '6205-C2HRS',
      '6301-2RS',
      'RET-104',
      'RET-045',
      'PK-7721',
      'CR-8001',
      'R8-2RS',
    ]);
    expect(new Set([...canonical, ...supplement.products].map((item) => item.sku)).size).toBe(105);
    expect(JSON.stringify(CLIENT_TEMPLATE_MANIFEST)).toBe(before);
    expect(
      supplement.products.every((item) =>
        item.description?.startsWith('Dato ilustrativo de prueba QAS'),
      ),
    ).toBe(true);
  });

  it('keeps absent identifiers absent and preserves the demonstrative duplicate provider value', () => {
    expect(product('RET-104')).toMatchObject({ providerCode: null, unifiedCode: null });
    expect(product('RET-045')).toMatchObject({ providerCode: null, unifiedCode: null });
    expect(product('6301-2RS').unifiedCode).toBeNull();
    expect(product('RET-045').values).not.toHaveProperty('tipo_aplicacion');
    expect(product('CR-8001').values.codigo_proveedor).toBe('GU-1000');
  });

  it('maps every value to an applicable, typed attribute of the current template', () => {
    const definitions = new Map(
      CLIENT_TEMPLATE_MANIFEST.definitions.map((definition) => [definition.key, definition]),
    );
    for (const item of QAS_DEMO_SUPPLEMENT.products) {
      const template = CLIENT_TEMPLATE_MANIFEST.templates.find(
        (candidate) =>
          candidate.categorySlug === item.categorySlug && candidate.variantKey === item.variantKey,
      );
      expect(template).toBeDefined();
      for (const [key, value] of Object.entries(item.values)) {
        expect(template?.attributes.some((attribute) => attribute.key === key)).toBe(true);
        const definition = definitions.get(key);
        expect(definition).toBeDefined();
        expect(typeof value).toBe(
          definition?.dataType === 'number' || definition?.dataType === 'measurement'
            ? 'number'
            : definition?.dataType === 'boolean'
              ? 'boolean'
              : 'string',
        );
      }
    }
    expect(product('6205-2RS1').values.sellos).toBe(true);
    expect(product('RET-104').values.b_altura1_mm).toBe(7);
    expect(product('CR-8001').values.diametro_del_dado_mm).toBe(27);
  });

  it('converts the imperial example to metric while retaining its original measurements in provenance', () => {
    const imperial = product('R8-2RS');
    expect(imperial.values).toMatchObject({
      d_diametro_del_agujero_mm: '12.7 mm',
      d_diametro_exterior_mm: '28.575 mm',
      b_altura_mm: '7.9375 mm',
      tmin_temperatura_min_de_funcionamiento: '-30 °C',
      tmax_temperatura_max_de_funcionamiento: '110 °C',
    });
    expect(
      Number(String(imperial.values.cr_capacidad_de_carga_dinamica_radial_n).split(' ')[0]),
    ).toBeCloseTo(5115.454857549575, 8);
    expect(Number(String(imperial.values.m_peso_kg).split(' ')[0])).toBeCloseTo(0.03401942775, 9);
    expect(imperial.description).toContain('dDiametroDelAgujeroMm=0.5 in');
    expect(imperial.description).toContain('tmaxTemperaturaMaxDeFuncionamiento=230 °F');
  });

  it('keeps illustrative references linked to existing groups without carrying approvals or fabricated files', () => {
    const codes = new Set([
      ...CLIENT_TEMPLATE_MANIFEST.templates.flatMap((template) =>
        template.products.map((item) => item.unifiedCode),
      ),
      ...QAS_DEMO_SUPPLEMENT.products.map((item) => item.unifiedCode).filter(Boolean),
    ]);
    expect(QAS_DEMO_SUPPLEMENT.homologs).toHaveLength(24);
    expect(QAS_DEMO_SUPPLEMENT.oem).toHaveLength(9);
    expect(QAS_DEMO_SUPPLEMENT.applications).toHaveLength(4);
    for (const relation of [
      ...(QAS_DEMO_SUPPLEMENT.homologs ?? []),
      ...(QAS_DEMO_SUPPLEMENT.oem ?? []),
      ...(QAS_DEMO_SUPPLEMENT.applications ?? []),
    ]) {
      expect(codes.has(relation.codigo_unificador)).toBe(true);
      expect(relation.estado).toBe('REVISIÓN');
      expect(relation.fuente).toContain('ILUSTRATIVO QAS');
    }
    expect(
      QAS_DEMO_SUPPLEMENT.applications?.every((item) => item.vehicleType === 'AUTOMOTRIZ'),
    ).toBe(true);
    expect(JSON.stringify(QAS_DEMO_SUPPLEMENT)).not.toContain('.pdf');
    expect(JSON.stringify(QAS_DEMO_SUPPLEMENT)).not.toContain('approved');
    expect(QAS_DEMO_SUPPLEMENT).not.toHaveProperty('assets');
  });

  it('records the public source and verified snapshot hash', () => {
    expect(QAS_DEMO_SOURCE.url).toBe('https://cdr-example.pages.dev/');
    expect(QAS_DEMO_SOURCE.canonicalWorkbookSha256).toBe(CLIENT_TEMPLATE_MANIFEST.source.sha256);
    expect(QAS_DEMO_SOURCE.sourceFiles).toHaveLength(8);
    expect(QAS_DEMO_SOURCE.sourceFiles.every((file) => /^[a-f0-9]{64}$/u.test(file.sha256))).toBe(
      true,
    );
    expect(QAS_DEMO_SOURCE.demoProductsSha256).toBe(
      '9570f103e7a9801c2ff9db1fd2c3ae091e340472cfa83bbbaddce0b6639536fe',
    );
  });
});
