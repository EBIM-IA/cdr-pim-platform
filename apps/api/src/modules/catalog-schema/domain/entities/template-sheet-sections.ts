import type { TemplateSection } from './catalog-schema';

/** Designer reference app.js SEC_AUTO; final business templates can replace these sections. */
export function defaultTemplateSections(rigidBall = false): TemplateSection[] {
  return (
    rigidBall
      ? [
          ['ident', 'Identificación del producto'],
          ['car', 'Características / Especificaciones'],
          ['dim', 'Dimensiones'],
          ['rend', 'Datos de rendimiento'],
          ['docs', 'Documentos y activos'],
          ['emp', 'Empaque'],
        ]
      : [
          ['ident', 'Identificación del producto'],
          ['car', 'Características / Especificaciones'],
          ['dim', 'Dimensiones y datos de rendimiento'],
          ['docs', 'Documentos y activos'],
          ['emp', 'Empaque'],
        ]
  ).map(([key, label], position) => ({ key: key!, label: label!, position }));
}
const rigidBallSectionKeys: Readonly<Record<string, string>> = {
  codigoarticulo: 'ident',
  codigoproveedor: 'ident',
  codigounificador: 'ident',
  categorian1: 'ident',
  categorian2: 'ident',
  categorian3: 'ident',
  tipoaplicacion: 'ident',
  marca: 'ident',
  frecuencia: 'ident',
  ecommerce: 'ident',
  bloqueadoventa: 'ident',
  bloqueadocompra: 'ident',
  especificaciontecnica: 'ident',
  codigodefabrica: 'ident',
  marcado: 'ident',
  etiqueta: 'ident',
  codigoean: 'ident',
  materialdelajaula: 'car',
  clasedetolerancia: 'car',
  lubricante: 'car',
  juegoradialinterno: 'car',
  sellos: 'car',
  tipodesello: 'car',
  tipodeagujero: 'car',
  hileras: 'car',
  ddiametrodelagujeromm: 'dim',
  ddiametroexteriormm: 'dim',
  balturamm: 'dim',
  damindiametrominimoresaltedeleje: 'dim',
  damaxdiametromaximodelresaltedelalojamiento: 'dim',
  ramaxradiomaximodegarganta: 'dim',
  rmincotadechaflanminima: 'dim',
  d1diametrodelresaltedelanilloexterior: 'dim',
  d1diametrodelresaltedelanillointerior: 'dim',
  d2diametrodelcalibredelanillointerior: 'dim',
  crcapacidaddecargadinamicaradialn: 'rend',
  c0rcapacidaddecargaestaticaradialn: 'rend',
  curlimitedecargaporfatigaradialn: 'rend',
  ngvelocidadlimitederotacion: 'rend',
  tmintemperaturamindefuncionamiento: 'rend',
  tmaxtemperaturamaxdefuncionamiento: 'rend',
  f0factordecalculo: 'rend',
  fichatecnica: 'docs',
  fichadeseguridadmsds: 'docs',
  certificadodeconformidaddistribuidorautorizadooriginalidad: 'docs',
  fotografiasdelproducto: 'docs',
  plano: 'docs',
  pesokg: 'emp',
  mpesokg: 'emp',
  undsporcajajuego: 'emp',
};
/** Source-backed rigid-ball assignments override the designer's automatic classification. */
export function defaultAttributeSection(
  definition: { key: string; label: string; sourceAuthority: string; dataType: string },
  rigidBall = false,
): string {
  if (rigidBall) {
    const mapped = rigidBallSectionKeys[definition.key.replaceAll('_', '').toLowerCase()];
    if (mapped) return mapped;
  }
  if (definition.sourceAuthority === 'erp') return 'ident';
  if (/(ficha_tecnica|ficha_de_seguridad|certificado|fotografia|^plano$)/u.test(definition.key))
    return 'docs';
  if (/^(c[oó]digo\s*ean|peso|unds?\s*por\s*caja|unidades\s*por\s*caja)/iu.test(definition.label))
    return 'emp';
  if (definition.dataType === 'measurement' || /^\([^)]+\)/u.test(definition.label)) return 'dim';
  return 'car';
}
