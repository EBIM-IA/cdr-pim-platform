/**
 * Conversiones de unidades para presentación.
 *
 * Estas funciones son puras: nunca reemplazan el valor registrado. La UI puede
 * mostrar la conversión y conservar `sourceText` como evidencia del dato de
 * origen.
 */

export type MeasurementSystem = 'metric' | 'imperial';
export type UnitSystem = MeasurementSystem | 'neutral';

export type MeasurementUnit =
  | 'mm'
  | 'cm'
  | 'in'
  | 'kg'
  | 'g'
  | 'lb'
  | 'oz'
  | 'N'
  | 'lbf'
  | '°C'
  | '°F'
  | 'L'
  | 'ml'
  | 'gal'
  | 'fl oz'
  | 'bar'
  | 'psi'
  | 'rpm';

export interface MeasurementHint {
  /** Unidad declarada por la plantilla o por el metadato del atributo. */
  unit?: string;
  /** Clave del atributo; por ejemplo, `dDiametroExteriorMm`. */
  attributeKey?: string;
}

export type MeasurementUnitHint = string | MeasurementHint;

export interface ParsedMeasurement {
  sourceText: string;
  values: readonly number[];
  unit: MeasurementUnit;
  hasWrittenUnit: boolean;
}

export interface ConvertedMeasurement {
  sourceText: string;
  from: MeasurementUnit;
  fromSystem: MeasurementSystem;
  to: MeasurementUnit;
  toSystem: MeasurementSystem;
  originalValues: readonly number[];
  convertedValues: readonly number[];
  originalText: string;
  convertedText: string;
}

export interface MeasurementDisplayValue {
  text: string;
  system: UnitSystem;
  unit: MeasurementUnit;
  /** Indica si este valor es el registrado, no uno calculado. */
  registered: boolean;
}

export interface MeasurementDisplay {
  sourceText: string;
  primary: MeasurementDisplayValue;
  secondary: MeasurementDisplayValue | null;
  registeredIsPrimary: boolean;
  neutral: boolean;
}

interface UnitDefinition {
  system: UnitSystem;
  counterpart?: MeasurementUnit;
  convert?: (value: number) => number;
  decimals?: number;
}

const LB_PER_KG = 2.20462262;
const GRAMS_PER_OUNCE = 28.3495231;
const LBF_PER_NEWTON = 0.224808943;
const LITERS_PER_US_GALLON = 3.785411784;
const MILLILITERS_PER_FLUID_OUNCE = 29.5735296;
const PSI_PER_BAR = 14.5037738;

export const UNIT_DEFINITIONS: Readonly<Record<MeasurementUnit, UnitDefinition>> = {
  mm: {
    system: 'metric',
    counterpart: 'in',
    convert: (value) => value / 25.4,
    decimals: 3,
  },
  cm: {
    system: 'metric',
    counterpart: 'in',
    convert: (value) => value / 2.54,
    decimals: 2,
  },
  in: {
    system: 'imperial',
    counterpart: 'mm',
    convert: (value) => value * 25.4,
    decimals: 2,
  },
  kg: {
    system: 'metric',
    counterpart: 'lb',
    convert: (value) => value * LB_PER_KG,
    decimals: 3,
  },
  g: {
    system: 'metric',
    counterpart: 'oz',
    convert: (value) => value / GRAMS_PER_OUNCE,
    decimals: 2,
  },
  lb: {
    system: 'imperial',
    counterpart: 'kg',
    convert: (value) => value / LB_PER_KG,
    decimals: 3,
  },
  oz: {
    system: 'imperial',
    counterpart: 'g',
    convert: (value) => value * GRAMS_PER_OUNCE,
    decimals: 1,
  },
  N: {
    system: 'metric',
    counterpart: 'lbf',
    convert: (value) => value * LBF_PER_NEWTON,
    decimals: 1,
  },
  lbf: {
    system: 'imperial',
    counterpart: 'N',
    convert: (value) => value / LBF_PER_NEWTON,
    decimals: 0,
  },
  '°C': {
    system: 'metric',
    counterpart: '°F',
    convert: (value) => (value * 9) / 5 + 32,
    decimals: 0,
  },
  '°F': {
    system: 'imperial',
    counterpart: '°C',
    convert: (value) => ((value - 32) * 5) / 9,
    decimals: 0,
  },
  L: {
    system: 'metric',
    counterpart: 'gal',
    convert: (value) => value / LITERS_PER_US_GALLON,
    decimals: 3,
  },
  ml: {
    system: 'metric',
    counterpart: 'fl oz',
    convert: (value) => value / MILLILITERS_PER_FLUID_OUNCE,
    decimals: 1,
  },
  gal: {
    system: 'imperial',
    counterpart: 'L',
    convert: (value) => value * LITERS_PER_US_GALLON,
    decimals: 2,
  },
  'fl oz': {
    system: 'imperial',
    counterpart: 'ml',
    convert: (value) => value * MILLILITERS_PER_FLUID_OUNCE,
    decimals: 0,
  },
  bar: {
    system: 'metric',
    counterpart: 'psi',
    convert: (value) => value * PSI_PER_BAR,
    decimals: 1,
  },
  psi: {
    system: 'imperial',
    counterpart: 'bar',
    convert: (value) => value / PSI_PER_BAR,
    decimals: 2,
  },
  rpm: { system: 'neutral' },
};

const UNIT_ALIASES: ReadonlyArray<readonly [RegExp, MeasurementUnit]> = [
  [/^(mm|milimetros?)$/i, 'mm'],
  [/^cm$/i, 'cm'],
  [/^("|'|''|in|inch|inches|pulg\.?|pulgadas?)$/i, 'in'],
  [/^(kg|kilos?|kilogramos?)$/i, 'kg'],
  [/^(g|gr|gramos?)$/i, 'g'],
  [/^(lb|lbs|libras?)$/i, 'lb'],
  [/^oz$/i, 'oz'],
  [/^n$/i, 'N'],
  [/^(lbf|lb-f)$/i, 'lbf'],
  [/^[°º⁰]?\s*c$/i, '°C'],
  [/^[°º⁰]?\s*f$/i, '°F'],
  [/^(l|lt|lts|litros?)$/i, 'L'],
  [/^(ml|mililitros?)$/i, 'ml'],
  [/^(gl|gal|galon|galón|galones)$/i, 'gal'],
  [/^fl\.?\s*oz$/i, 'fl oz'],
  [/^bar$/i, 'bar'],
  [/^psi$/i, 'psi'],
  [/^(rpm|1\/min|min-1|min⁻¹)$/i, 'rpm'],
];

/** Normaliza escrituras habituales a una unidad soportada. */
export function canonicalizeUnit(unit: string | null | undefined): MeasurementUnit | null {
  const candidate = String(unit ?? '').trim();

  if (!candidate) return null;

  const alias = UNIT_ALIASES.find(([pattern]) => pattern.test(candidate));
  return alias?.[1] ?? null;
}

/**
 * Infiere unidades únicamente desde sufijos inequívocos usados por las claves
 * del catálogo. Para sufijos de una letra se exige además contexto semántico,
 * con el fin de evitar falsos positivos.
 */
export function inferUnitFromAttributeKey(
  attributeKey: string | null | undefined,
): MeasurementUnit | null {
  const key = String(attributeKey ?? '')
    .trim()
    .replace(/[\s_.-]+/g, '')
    .toLowerCase();

  if (!key) return null;

  const suffixes: ReadonlyArray<readonly [string, MeasurementUnit]> = [
    ['floz', 'fl oz'],
    ['lbf', 'lbf'],
    ['psi', 'psi'],
    ['bar', 'bar'],
    ['gal', 'gal'],
    ['rpm', 'rpm'],
    ['ml', 'ml'],
    ['kg', 'kg'],
    ['lb', 'lb'],
    ['oz', 'oz'],
    ['mm', 'mm'],
    ['cm', 'cm'],
    ['inch', 'in'],
    ['in', 'in'],
  ];
  const suffix = suffixes.find(([candidate]) => key.endsWith(candidate));

  if (suffix) return suffix[1];
  if (key.endsWith('n') && /(carga|fuerza|force)/.test(key)) return 'N';
  if (key.endsWith('c') && /(temperatura|temperature)/.test(key)) return '°C';
  if (key.endsWith('f') && /(temperatura|temperature)/.test(key)) return '°F';
  if (key.endsWith('l') && /(volumen|volume|capacidad)/.test(key)) return 'L';
  if (key.endsWith('g') && /(peso|masa|weight|mass)/.test(key)) return 'g';

  return null;
}

function hintedUnit(hint?: MeasurementUnitHint): MeasurementUnit | null {
  if (typeof hint === 'string') return canonicalizeUnit(hint);
  return canonicalizeUnit(hint?.unit) ?? inferUnitFromAttributeKey(hint?.attributeKey);
}

function parseNumber(value: string): number | null {
  let normalized = value.replace(/[−–]/g, '-').replace(/\s+/g, '');

  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/**
 * Lee una magnitud simple o un rango. Una unidad escrita en el valor siempre
 * tiene prioridad sobre la sugerencia de metadato o de clave.
 */
export function parseMeasurement(
  raw: unknown,
  hint?: MeasurementUnitHint,
): ParsedMeasurement | null {
  const sourceText = String(raw ?? '').trim();

  if (!sourceText || sourceText === '-') return null;

  const match =
    /^([-−–]?\s*\d[\d.,]*)(?:\s*(?:-|–|a)\s*([-−–]?\s*\d[\d.,]*))?\s*([^\d\s][^\d]*)?$/i.exec(
      sourceText,
    );

  if (!match) return null;

  const firstToken = match[1];
  if (!firstToken) return null;
  const first = parseNumber(firstToken);
  const second = match[2] === undefined ? null : parseNumber(match[2]);

  if (first === null || (match[2] !== undefined && second === null)) {
    return null;
  }

  const writtenUnit = match[3]?.trim() ?? '';
  const unit = writtenUnit ? canonicalizeUnit(writtenUnit) : hintedUnit(hint);

  // Si el usuario escribió una unidad desconocida, no se reemplaza por la
  // sugerida: el dato completo se conserva sin conversión.
  if (!unit) return null;

  return {
    sourceText,
    values: second === null ? [first] : [first, second],
    unit,
    hasWrittenUnit: Boolean(writtenUnit),
  };
}

function formatNumber(value: number, decimals: number): string {
  return Number(value.toFixed(decimals)).toLocaleString('de-DE', {
    maximumFractionDigits: decimals,
  });
}

function formatValues(values: readonly number[], unit: MeasurementUnit, decimals = 4): string {
  return `${values.map((value) => formatNumber(value, decimals)).join(' – ')} ${unit}`;
}

/** Devuelve el equivalente en el sistema opuesto, sin modificar `raw`. */
export function convertMeasurement(
  raw: unknown,
  hint?: MeasurementUnitHint,
): ConvertedMeasurement | null {
  const parsed = parseMeasurement(raw, hint);

  if (!parsed) return null;

  const definition = UNIT_DEFINITIONS[parsed.unit];

  if (definition.system === 'neutral' || !definition.counterpart || !definition.convert) {
    return null;
  }

  const counterpart = UNIT_DEFINITIONS[definition.counterpart];
  const convertedValues = parsed.values.map(definition.convert);

  return {
    sourceText: parsed.sourceText,
    from: parsed.unit,
    fromSystem: definition.system,
    to: definition.counterpart,
    toSystem: counterpart.system as MeasurementSystem,
    originalValues: parsed.values,
    convertedValues,
    originalText: formatValues(parsed.values, parsed.unit),
    convertedText: formatValues(convertedValues, definition.counterpart, definition.decimals),
  };
}

/**
 * Proyecta una magnitud para el selector métrico/imperial de la ficha.
 * `primary` sigue el sistema elegido; `secondary` conserva el otro sistema como
 * referencia e indica cuál de los dos es el dato registrado.
 */
export function displayMeasurement(
  raw: unknown,
  hint?: MeasurementUnitHint,
  targetSystem: MeasurementSystem = 'metric',
): MeasurementDisplay | null {
  const parsed = parseMeasurement(raw, hint);

  if (!parsed) return null;

  const definition = UNIT_DEFINITIONS[parsed.unit];
  const registered: MeasurementDisplayValue = {
    text: formatValues(parsed.values, parsed.unit),
    system: definition.system,
    unit: parsed.unit,
    registered: true,
  };

  if (definition.system === 'neutral') {
    return {
      sourceText: parsed.sourceText,
      primary: registered,
      secondary: null,
      registeredIsPrimary: true,
      neutral: true,
    };
  }

  const conversion = convertMeasurement(raw, hint);

  if (!conversion) return null;

  const converted: MeasurementDisplayValue = {
    text: conversion.convertedText,
    system: conversion.toSystem,
    unit: conversion.to,
    registered: false,
  };
  const registeredIsPrimary = definition.system === targetSystem;

  return {
    sourceText: parsed.sourceText,
    primary: registeredIsPrimary ? registered : converted,
    secondary: registeredIsPrimary ? converted : registered,
    registeredIsPrimary,
    neutral: false,
  };
}

/** Unidades válidas para un selector: la registrada y su equivalente. */
export function unitChoices(unit: string | null | undefined): readonly MeasurementUnit[] {
  const canonical = canonicalizeUnit(unit);

  if (!canonical) return [];

  const counterpart = UNIT_DEFINITIONS[canonical].counterpart;
  return counterpart ? [canonical, counterpart] : [canonical];
}

export function unitSystem(unit: string | null | undefined): UnitSystem | null {
  const canonical = canonicalizeUnit(unit);
  return canonical ? UNIT_DEFINITIONS[canonical].system : null;
}
