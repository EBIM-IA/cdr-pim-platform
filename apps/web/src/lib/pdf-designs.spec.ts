import { describe, expect, it } from 'vitest';
import { createDefaultPdfDesignConfig } from '@cdr/contracts';
import {
  matchLogoFilename,
  normalizeLogoBrand,
  resolvePdfBrandLogo,
  resolvePdfDesign,
} from './pdf-designs';

describe('PDF presentation resolution', () => {
  it('resolves assigned designs without changing the shared template', () => {
    const config = createDefaultPdfDesignConfig();
    config.templateRules.push({
      templateId: 'real-template',
      designId: 'compacta',
      hiddenSections: ['docs'],
      sectionTitles: { car: 'Datos de rendimiento' },
    });
    expect(resolvePdfDesign(config, 'real-template').design.id).toBe('compacta');
    expect(resolvePdfDesign(config, 'other').design.id).toBe('cdr');
  });
  it('prefers own logos, then the longest parent brand and manufacturer aliases', () => {
    const config = createDefaultPdfDesignConfig();
    config.brandLogos = [
      { brand: 'OKAMI', dataUrl: 'parent' },
      { brand: 'OKAMI FRENOS', dataUrl: 'own' },
      { brand: 'SCHAEFFLER', dataUrl: 'fag' },
    ];
    expect(resolvePdfBrandLogo(config, 'Okami Frenos')?.dataUrl).toBe('own');
    expect(resolvePdfBrandLogo(config, 'OKAMI AUTOMOTRIZ')?.dataUrl).toBe('parent');
    expect(resolvePdfBrandLogo(config, 'FAG AUTOMOTRIZ')?.dataUrl).toBe('fag');
    expect(normalizeLogoBrand(' Goodyear_lubricantes ')).toBe('GOODYEAR LUBRICANTES');
  });
  it('matches bulk filenames and leaves unknown brands for human review', () => {
    const brands = ['SKF', 'OKAMI', 'OKAMI FRENOS', 'NSK'];
    expect(matchLogoFilename('carpeta/SKF_logo.png', brands)).toBe('SKF');
    expect(matchLogoFilename('Logo OKAMI FRENOS color.svg', brands)).toBe('OKAMI FRENOS');
    expect(matchLogoFilename('otra.png', brands)).toBe('');
  });
});
