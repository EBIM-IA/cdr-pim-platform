import { ProductAssetsModule } from '../product-assets/product-assets.module';
import { SimulateQualityUseCase } from './application/simulate-quality.use-case';
import { QUALITY_CANDIDATE_CAPTURE } from './domain/ports/quality-candidate-capture.port';
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogSchemaModule } from '../catalog-schema/catalog-schema.module';
import { QualityGovernanceUseCases } from './application/quality-governance.use-cases';
import { QualityGovernanceController } from './presentation/quality-governance.controller';
@Module({
  imports: [CatalogModule, CatalogSchemaModule, ProductAssetsModule],
  controllers: [QualityGovernanceController],
  providers: [
    QualityGovernanceUseCases,
    SimulateQualityUseCase,
    { provide: QUALITY_CANDIDATE_CAPTURE, useExisting: QualityGovernanceUseCases },
  ],
  exports: [QUALITY_CANDIDATE_CAPTURE],
})
export class QualityModule {}
