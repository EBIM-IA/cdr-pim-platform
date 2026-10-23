/**
 * QAS-only illustrative supplement captured from https://cdr-example.pages.dev/.
 * The 25 public source files matched the designer's local copy byte for byte on 2026-10-22.
 * Canonical workbook data stays in CLIENT_TEMPLATE_MANIFEST; this file adds the eight
 * sourceBacked:false examples and their existing illustrative relations. It performs no writes.
 * Workflow approvals, historical actors/dates, synthetic documents and PrestaShop states are
 * deliberately absent. Missing provider/unifier values remain absent.
 */
import {
  CLIENT_TEMPLATE_MANIFEST,
  type ClientAttributeValue,
  type ClientManifestDefinition,
  type ClientTemplateManifest,
} from './client-template-manifest';
import type { QasDemoSupplement, QasDemoSupplementProduct } from './qas-demo-seed';

export const QAS_DEMO_SOURCE = {
  url: 'https://cdr-example.pages.dev/',
  demoProductsSha256: '9570f103e7a9801c2ff9db1fd2c3ae091e340472cfa83bbbaddce0b6639536fe',
  sourceRecordsSha256: '51c53b04b3031762528cb01f5064c1d948c17e9240538b188098368f5fe199ca',
  notice: 'Dato ilustrativo de prueba QAS',
  canonicalWorkbookSha256: CLIENT_TEMPLATE_MANIFEST.source.sha256,
  sourceFiles: [
    {
      url: 'https://cdr-example.pages.dev/data/demo-products.js',
      sha256: '9570f103e7a9801c2ff9db1fd2c3ae091e340472cfa83bbbaddce0b6639536fe',
    },
    {
      url: 'https://cdr-example.pages.dev/data/pim-categories.js',
      sha256: '405b70a3784fd555ae2ccd3a311fa03a2b852b3189068c01510cff459e86f55c',
    },
    {
      url: 'https://cdr-example.pages.dev/data/pim-equivalences.js',
      sha256: 'faeb30088e23c22eea6e9e272590c17448a00fbd87004ef8a554910a94e55291',
    },
    {
      url: 'https://cdr-example.pages.dev/data/pim-helpers.js',
      sha256: 'bc085f4795e73be2fc90c8a8ecb37496786df466ba4da07af53a0f6671ecbee9',
    },
    {
      url: 'https://cdr-example.pages.dev/data/pim-illustrative.js',
      sha256: 'daf397e5a95db3e6259f609985b05dfd6c89d9fa94fd9d56f8f81493532622f5',
    },
    {
      url: 'https://cdr-example.pages.dev/data/pim-relations.js',
      sha256: 'b32a56743e8864c1c85c64ea8ee01e9a1416371d9c9d8516f320e0a44793ea79',
    },
    {
      url: 'https://cdr-example.pages.dev/data/pim-source-records.js',
      sha256: '51c53b04b3031762528cb01f5064c1d948c17e9240538b188098368f5fe199ca',
    },
    {
      url: 'https://cdr-example.pages.dev/data/pim-templates.js',
      sha256: 'dfca4f894a2b48273e14c02fbe5eaf785faaf41814a643e2d5889f0505c20872',
    },
  ],
} as const;

interface IllustrativeProduct {
  readonly sku: string;
  readonly templateId: string;
  readonly name: string;
  readonly values: Readonly<Record<string, string>>;
}

const PRODUCTS: readonly IllustrativeProduct[] = [
  {
    sku: '6205-2RS1',
    templateId: 'rod-bolas-rigido',
    name: 'Rodamiento rígido de bolas',
    values: {
      codigoArticulo: '6205-2RS1',
      codigoProveedor: '6205-2RS1',
      codigoUnificador: 'UNI-000123',
      tipoAplicacion: 'AUTOMOTRIZ E INDUSTRIAL',
      marca: 'SKF',
      sellos: 'SI',
      tipoDeAgujero: 'Cilindrico',
      hileras: '1',
      dDiametroDelAgujeroMm: '25',
      dDiametroExteriorMm: '52',
      bAlturaMm: '15',
      categoriaN1: 'RODAMIENTOS Y AFINES',
      categoriaN2: 'RODAMIENTO',
      categoriaN3: 'DE BOLAS RIGIDO',
    },
  },
  {
    sku: '6205-C2HRS',
    templateId: 'rod-bolas-rigido',
    name: 'Rodamiento rígido de bolas',
    values: {
      codigoArticulo: '6205-C2HRS',
      codigoProveedor: '6205-C-2HRS-C2',
      codigoUnificador: 'UNI-000123',
      tipoAplicacion: 'AUTOMOTRIZ',
      marca: 'FAG',
      sellos: 'SI',
      hileras: '1',
      dDiametroDelAgujeroMm: '25',
      dDiametroExteriorMm: '52',
      bAlturaMm: '15',
      juegoRadialInterno: 'C2',
      categoriaN1: 'RODAMIENTOS Y AFINES',
      categoriaN2: 'RODAMIENTO',
      categoriaN3: 'DE BOLAS RIGIDO',
    },
  },
  {
    sku: '6301-2RS',
    templateId: 'rod-bolas-rigido',
    name: 'Rodamiento rígido 6301 2RS',
    values: {
      codigoArticulo: '6301-2RS',
      codigoProveedor: '6301-2RSH',
      tipoAplicacion: 'INDUSTRIAL',
      marca: 'SKF',
      dDiametroDelAgujeroMm: '12',
      dDiametroExteriorMm: '37',
      bAlturaMm: '12',
      categoriaN1: 'RODAMIENTOS Y AFINES',
      categoriaN2: 'RODAMIENTO',
      categoriaN3: 'DE BOLAS RIGIDO',
    },
  },
  {
    sku: 'RET-104',
    templateId: 'retenedores',
    name: 'Retén 30 × 45 × 7',
    values: {
      codigoArticulo: 'RET-104',
      tipoAplicacion: 'AUTOMOTRIZ',
      marca: 'Corteco',
      dDiametroDelAgujeroMm: '30',
      dDiametroExteriorMm: '45',
      bAltura1Mm: '7',
      categoriaN1: 'SISTEMA DE SELLADOS',
      categoriaN2: 'RETENEDOR',
      categoriaN3: 'RETENEDOR',
    },
  },
  {
    sku: 'RET-045',
    templateId: 'retenedores',
    name: 'Retén 45 × 65 × 10',
    values: {
      codigoArticulo: 'RET-045',
      marca: 'NOK',
      dDiametroDelAgujeroMm: '45',
      dDiametroExteriorMm: '65',
      bAltura1Mm: '10',
      categoriaN1: 'SISTEMA DE SELLADOS',
      categoriaN2: 'RETENEDOR',
      categoriaN3: 'RETENEDOR',
    },
  },
  {
    sku: 'PK-7721',
    templateId: 'pastilla-de-freno',
    name: 'Pastilla de freno',
    values: {
      codigoArticulo: 'PK-7721',
      codigoProveedor: '0 986 494 672',
      codigoUnificador: 'D1672',
      tipoAplicacion: 'AUTOMOTRIZ',
      marca: 'BOSCH',
      categoriaN1: 'SISTEMA DE FRENADO Y SUS PARTES',
      categoriaN2: 'PASTILLA DE FRENO',
      categoriaN3: 'PASTILLA DE FRENO',
    },
  },
  {
    sku: 'CR-8001',
    templateId: 'cruceta',
    name: 'Cruceta 27 × 74',
    values: {
      codigoArticulo: 'CR-8001',
      codigoProveedor: 'GU-1000',
      codigoUnificador: 'GU-1000',
      tipoAplicacion: 'AUTOMOTRIZ',
      marca: 'GMB',
      diametroDelDadoMm: '27',
      longitudTotalM: '74',
      categoriaN1: 'TRANSMISION DE POTENCIA',
      categoriaN2: 'CRUCETA',
      categoriaN3: 'CRUCETA',
    },
  },
  {
    sku: 'R8-2RS',
    templateId: 'rod-bolas-rigido',
    name: 'Rodamiento rígido de bolas · serie en pulgadas',
    values: {
      codigoArticulo: 'R8-2RS',
      codigoProveedor: 'R8-2RS',
      codigoUnificador: 'R8-2RS',
      tipoAplicacion: 'INDUSTRIAL',
      marca: 'NSK',
      materialDeLaJaula: 'Chapa metálica de acero',
      juegoRadialInterno: 'CN',
      sellos: 'SI',
      tipoDeSello: 'Caucho',
      tipoDeAgujero: 'Cilindrico',
      hileras: '1',
      dDiametroDelAgujeroMm: '0.5 in',
      dDiametroExteriorMm: '1.125 in',
      bAlturaMm: '0.3125 in',
      crCapacidadDeCargaDinamicaRadialN: '1150 lbf',
      c0rCapacidadDeCargaEstaticaRadialN: '540 lbf',
      mPesoKg: '1.2 oz',
      tminTemperaturaMinDeFuncionamiento: '-22 °F',
      tmaxTemperaturaMaxDeFuncionamiento: '230 °F',
      categoriaN1: 'RODAMIENTOS Y AFINES',
      categoriaN2: 'RODAMIENTO',
      categoriaN3: 'DE BOLAS RIGIDO',
    },
  },
];

const VARIANT_BY_PROTOTYPE_TEMPLATE: Readonly<Record<string, string>> = {
  'rod-bolas-rigido': '14',
  retenedores: '7',
  'pastilla-de-freno': '1',
  cruceta: '10',
};

const ATTRIBUTE_KEYS: Readonly<Record<string, string>> = {
  codigoArticulo: 'codigo_articulo',
  categoriaN1: 'categoria_principal',
  categoriaN2: 'categoria_segundo_nivel',
  categoriaN3: 'categoria_tercer_nivel',
  codigoProveedor: 'codigo_proveedor',
  codigoUnificador: 'codigo_unificador',
  tipoAplicacion: 'tipo_aplicacion',
  marca: 'marca',
  sellos: 'sellos',
  tipoDeAgujero: 'tipo_de_agujero',
  hileras: 'hileras',
  dDiametroDelAgujeroMm: 'd_diametro_del_agujero_mm',
  dDiametroExteriorMm: 'd_diametro_exterior_mm',
  bAlturaMm: 'b_altura_mm',
  juegoRadialInterno: 'juego_radial_interno',
  bAltura1Mm: 'b_altura1_mm',
  diametroDelDadoMm: 'diametro_del_dado_mm',
  longitudTotalM: 'longitud_total_m',
  materialDeLaJaula: 'material_de_la_jaula',
  tipoDeSello: 'tipo_de_sello',
  crCapacidadDeCargaDinamicaRadialN: 'cr_capacidad_de_carga_dinamica_radial_n',
  c0rCapacidadDeCargaEstaticaRadialN: 'c0r_capacidad_de_carga_estatica_radial_n',
  mPesoKg: 'm_peso_kg',
  tminTemperaturaMinDeFuncionamiento: 'tmin_temperatura_min_de_funcionamiento',
  tmaxTemperaturaMaxDeFuncionamiento: 'tmax_temperatura_max_de_funcionamiento',
};

function metricValue(value: string): { value: number; unit: string } | null {
  const match = /^(-?\d+(?:\.\d+)?)\s*(in|lbf|oz|°F)$/u.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (match[2] === 'in') return { value: amount * 25.4, unit: 'mm' };
  if (match[2] === 'lbf') return { value: amount * 4.4482216152605, unit: 'N' };
  if (match[2] === 'oz') return { value: amount * 0.028349523125, unit: 'kg' };
  return { value: ((amount - 32) * 5) / 9, unit: '°C' };
}

function typedValue(value: string, definition: ClientManifestDefinition): ClientAttributeValue {
  const metric = metricValue(value);
  const numeric = metric ? metric.value : Number(value.replace(',', '.'));
  if (definition.dataType === 'number' || definition.dataType === 'measurement') {
    if (!Number.isFinite(numeric))
      throw new Error('Invalid QAS numeric value for ' + definition.key);
    return Number(numeric.toFixed(10));
  }
  if (definition.dataType === 'boolean') {
    if (value === 'SI') return true;
    if (value === 'NO') return false;
    throw new Error('Invalid QAS boolean value for ' + definition.key);
  }
  return metric ? String(Number(metric.value.toFixed(10))) + ' ' + metric.unit : value;
}

export function buildQasDemoSupplement(
  manifest: ClientTemplateManifest = CLIENT_TEMPLATE_MANIFEST,
): QasDemoSupplement {
  const definitions = new Map(
    manifest.definitions.map((definition) => [definition.key, definition]),
  );
  const products: QasDemoSupplementProduct[] = PRODUCTS.map((product) => {
    const variant = VARIANT_BY_PROTOTYPE_TEMPLATE[product.templateId];
    const template = manifest.templates.find((candidate) => candidate.variantKey === variant);
    if (!template) throw new Error('Missing QAS target template for ' + product.sku);
    const applicable = new Set(template.attributes.map((attribute) => attribute.key));
    const values: Record<string, ClientAttributeValue> = {};
    for (const [sourceKey, value] of Object.entries(product.values)) {
      const key = ATTRIBUTE_KEYS[sourceKey];
      const definition = key ? definitions.get(key) : undefined;
      if (!key || !definition || !applicable.has(key))
        throw new Error('Unmapped QAS attribute ' + sourceKey + ' for ' + product.sku);
      values[key] = typedValue(value, definition);
    }
    const imperial = Object.entries(product.values)
      .filter(([, value]) => metricValue(value))
      .map(([key, value]) => key + '=' + value);
    const notes = imperial.length
      ? ' Valores imperiales de origen convertidos a métrico: ' + imperial.join('; ') + '.'
      : '';
    return {
      sku: product.sku,
      name: product.name,
      description:
        QAS_DEMO_SOURCE.notice +
        '. Fuente: ' +
        QAS_DEMO_SOURCE.url +
        ' (data/demo-products.js, sourceBacked:false). Clasificación heredada de la plantilla como en la demo.' +
        notes,
      brand: product.values.marca ?? null,
      providerCode: product.values.codigoProveedor ?? null,
      unifiedCode: product.values.codigoUnificador ?? null,
      categorySlug: template.categorySlug,
      variantKey: template.variantKey,
      values,
    };
  });
  return { products, homologs: HOMOLOGS, oem: OEM, applications: APPLICATIONS };
}

const HOMOLOGS = [
  {
    codigo_unificador: 'UNI-000123',
    codigo_homologo: '6205-2RS',
    marca_homologo: 'KOYO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Catálogo del fabricante',
  },
  {
    codigo_unificador: 'UNI-000123',
    codigo_homologo: '6205-2NSE',
    marca_homologo: 'NACHI',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Catálogo del fabricante',
  },
  {
    codigo_unificador: 'UNI-000123',
    codigo_homologo: '6205-2RS',
    marca_homologo: 'FBJ',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Manual CDR',
  },
  {
    codigo_unificador: '6202-2RS',
    codigo_homologo: '6202-2RS',
    marca_homologo: 'KOYO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Catálogo del fabricante',
  },
  {
    codigo_unificador: '6202-2RS',
    codigo_homologo: '6202-2NSE',
    marca_homologo: 'NACHI',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · TecDoc',
  },
  {
    codigo_unificador: 'D1672',
    codigo_homologo: 'QC1672',
    marca_homologo: 'WAGNER',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · TecDoc',
  },
  {
    codigo_unificador: 'D227',
    codigo_homologo: 'MX227',
    marca_homologo: 'WAGNER',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · TecDoc',
  },
  {
    codigo_unificador: 'GU-1000',
    codigo_homologo: '1-0153',
    marca_homologo: 'NEAPCO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Catálogo del fabricante',
  },
  {
    codigo_unificador: '6PK1875',
    codigo_homologo: '6PK1875',
    marca_homologo: 'BANDO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Catálogo del fabricante',
  },
  {
    codigo_unificador: '22207',
    codigo_homologo: '22207EJW33C3',
    marca_homologo: 'TIMKEN',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Catálogo del fabricante',
  },
  {
    codigo_unificador: '25-32-4 VITON',
    codigo_homologo: '710723',
    marca_homologo: 'NATIONAL',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Manual CDR',
  },
  {
    codigo_unificador: 'UNI-000123',
    codigo_homologo: '6205DDU',
    marca_homologo: 'NSK',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: 'UNI-000123',
    codigo_homologo: '6205LLU',
    marca_homologo: 'NTN',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '6202-2RS',
    codigo_homologo: '6202-2RSH/C3',
    marca_homologo: 'SKF',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '6202-2RS',
    codigo_homologo: '6202DDUC3',
    marca_homologo: 'NSK',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: 'D1672',
    codigo_homologo: 'FDB1672',
    marca_homologo: 'FERODO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '25-32-4 VITON',
    codigo_homologo: '12011594B',
    marca_homologo: 'CORTECO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '25-32-4 VITON',
    codigo_homologo: '25X32X4 HMSA10 V',
    marca_homologo: 'SKF',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: 'GU-1000',
    codigo_homologo: '5-153X',
    marca_homologo: 'SPICER',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '6PK1875',
    codigo_homologo: '6PK1875-GT',
    marca_homologo: 'GATES',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '6PK1875',
    codigo_homologo: '6PK1875-DY',
    marca_homologo: 'DAYCO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '22207',
    codigo_homologo: '22207 E/C3',
    marca_homologo: 'SKF',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '22207',
    codigo_homologo: '22207EAE4C3',
    marca_homologo: 'NSK',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
  {
    codigo_unificador: '0W20-1L',
    codigo_homologo: '0W20-SP-MB',
    marca_homologo: 'MOBIL',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · alternativa externa del prototipo',
  },
];

const OEM = [
  {
    codigo_unificador: 'D1672',
    codigo_oem: '04465-0K240',
    marca: 'TOYOTA',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
  {
    codigo_unificador: 'D1672',
    codigo_oem: '04465-0K290',
    marca: 'TOYOTA',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
  {
    codigo_unificador: 'UNI-000123',
    codigo_oem: '90363-25002',
    marca: 'TOYOTA, LEXUS',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
  {
    codigo_unificador: 'GU-1000',
    codigo_oem: '04371-35010',
    marca: 'TOYOTA',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
  {
    codigo_unificador: 'DAC3972AW4CS49',
    codigo_oem: '90369-39003',
    marca: 'TOYOTA',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
  {
    codigo_unificador: '569091',
    codigo_oem: '569091',
    marca: 'CHEVROLET, OPEL',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
  {
    codigo_unificador: '96470999',
    codigo_oem: '96470999',
    marca: 'CHEVROLET, DAEWOO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
  {
    codigo_unificador: '93231267',
    codigo_oem: '93231267',
    marca: 'CHEVROLET',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
  {
    codigo_unificador: '6PK1875',
    codigo_oem: '90916-02500',
    marca: 'TOYOTA',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS',
  },
];

const APPLICATIONS = [
  {
    codigo_unificador: 'UNI-000123',
    marca_vehiculo: 'TOYOTA',
    modelo: 'COROLLA',
    tipo: 'SEDAN',
    combustible: 'GSL',
    traccion: '4X2',
    cilindraje: '1.8L',
    ano_desde: 2014,
    ano_hasta: 2018,
    area: 'MOTOR',
    subarea: 'ALTERNADOR',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · TecDoc',
    vehicleType: 'AUTOMOTRIZ',
  },
  {
    codigo_unificador: 'UNI-000123',
    marca_vehiculo: 'NISSAN',
    modelo: 'SENTRA B17',
    tipo: 'SEDAN',
    combustible: 'GSL',
    traccion: '4X2',
    cilindraje: '1.8L',
    ano_desde: 2013,
    ano_hasta: 2019,
    area: 'MOTOR',
    subarea: 'ALTERNADOR',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Fabricante',
    vehicleType: 'AUTOMOTRIZ',
  },
  {
    codigo_unificador: 'D1672',
    marca_vehiculo: 'CHERY',
    modelo: 'TIGGO',
    tipo: 'SUV',
    combustible: 'GSL',
    traccion: '4X2',
    cilindraje: '2.0L',
    ano_desde: 2006,
    ano_hasta: 2012,
    area: 'FRENO DELANTERO',
    subarea: 'PASTILLAS',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · TecDoc',
    vehicleType: 'AUTOMOTRIZ',
  },
  {
    codigo_unificador: 'GU-1000',
    marca_vehiculo: 'MITSUBISHI',
    modelo: 'L200',
    tipo: 'PICK UP',
    combustible: 'DSL',
    traccion: '4X4',
    cilindraje: '2.5L',
    ano_desde: 2015,
    ano_hasta: 2022,
    area: 'TRANSMISION',
    subarea: 'CARDAN TRASERO',
    estado: 'REVISIÓN',
    fuente: 'ILUSTRATIVO QAS · Manual CDR',
    vehicleType: 'AUTOMOTRIZ',
  },
] as const;

export const QAS_DEMO_SUPPLEMENT = buildQasDemoSupplement();
