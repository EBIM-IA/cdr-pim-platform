import type { PdfDesignSettingsDto } from '@cdr/contracts';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
export interface PdfDesignSettingsPort {
  get(): Promise<PdfDesignSettingsDto>;
  save(input: PdfDesignSettingsDto, audit: AuditEntry): Promise<PdfDesignSettingsDto>;
}
export const PDF_DESIGN_SETTINGS = Symbol('PdfDesignSettings');
