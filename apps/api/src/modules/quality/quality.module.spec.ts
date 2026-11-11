import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { CLOCK, DATABASE, DATABASE_SQL } from '../../shared/tokens';
import { AUDIT_PORT } from '../audit/domain/ports/audit.port';
import { QualityModule } from './quality.module';
import { QualityGovernanceUseCases } from './application/quality-governance.use-cases';
import { QUALITY_CANDIDATE_CAPTURE } from './domain/ports/quality-candidate-capture.port';
import { QualityGovernanceController } from './presentation/quality-governance.controller';
@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: { now: () => new Date('2026-11-10T15:00:00Z') } },
    { provide: DATABASE, useValue: {} },
    { provide: DATABASE_SQL, useValue: vi.fn() },
    { provide: AUDIT_PORT, useValue: { record: vi.fn() } },
  ],
  exports: [CLOCK, DATABASE, DATABASE_SQL, AUDIT_PORT],
})
class TestPlatformModule {}
describe('QualityModule composition', () => {
  it('resolves its actual module graph and published capture port without a database connection', async () => {
    const module = await Test.createTestingModule({
      imports: [TestPlatformModule, QualityModule],
    }).compile();
    expect(module.get(QualityGovernanceController)).toBeInstanceOf(QualityGovernanceController);
    expect(module.get(QUALITY_CANDIDATE_CAPTURE)).toBe(module.get(QualityGovernanceUseCases));
    await module.close();
  });
});
