import { describe, expect, it } from 'vitest';
import {
  createDefaultPdfDesignConfig,
  pdfDesignConfigSchema,
  pdfDesignSettingsSchema,
} from './pdf-design';

describe('PDF design settings', () => {
  it('accepts approved defaults and isolated copies', () => {
    const config = createDefaultPdfDesignConfig();
    expect(pdfDesignSettingsSchema.parse({ config, updatedAt: null }).config.defaultDesignId).toBe(
      'cdr',
    );
    config.designs[0]!.name = 'Otro nombre';
    expect(createDefaultPdfDesignConfig().designs[0]!.name).toBe('Casa del Rulimán · ejemplos');
  });
  it('rejects dangling designs/fonts and duplicate template assignments', () => {
    const config = createDefaultPdfDesignConfig();
    config.defaultDesignId = 'missing';
    expect(pdfDesignConfigSchema.safeParse(config).success).toBe(false);
    config.defaultDesignId = 'cdr';
    config.designs[0]!.fonts.head = 'unknown';
    expect(pdfDesignConfigSchema.safeParse(config).success).toBe(false);
    config.designs[0]!.fonts.head = 'saira';
    config.templateRules = [1, 2].map(() => ({
      templateId: 'same',
      designId: 'cdr',
      hiddenSections: [],
      sectionTitles: {},
    }));
    expect(pdfDesignConfigSchema.safeParse(config).success).toBe(false);
  });
  it('validates URLs, image/font transport, control ranges and concurrency timestamp', () => {
    const input = { config: createDefaultPdfDesignConfig(), updatedAt: '2026-11-20T10:00:00.000Z' };
    expect(pdfDesignSettingsSchema.safeParse(input).success).toBe(true);
    input.config.designs[0]!.footer.qrUrl = 'javascript:alert(1)';
    expect(pdfDesignSettingsSchema.safeParse(input).success).toBe(false);
    input.config.designs[0]!.footer.qrUrl = 'https://example.com';
    input.config.cdrLogoDataUrl = 'data:image/svg+xml;base64,PHN2Zz4=';
    expect(pdfDesignSettingsSchema.safeParse(input).success).toBe(false);
    input.config.cdrLogoDataUrl = null;
    input.config.designs[0]!.page.margin = 100;
    expect(pdfDesignSettingsSchema.safeParse(input).success).toBe(false);
  });
});
