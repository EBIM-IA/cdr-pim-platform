import { Module } from '@nestjs/common';

import {
  CreateCodeAffixUseCase,
  DeactivateCodeAffixUseCase,
  ListCodeAffixesUseCase,
  ParseProductCodeUseCase,
  UpdateCodeAffixUseCase,
  ValidateCodeAffixUseCase,
} from './application/manage-code-affixes.use-cases';
import { CODE_AFFIX_REPOSITORY } from './domain/ports/code-affix.repository.port';
import { DrizzleCodeAffixRepository } from './infrastructure/persistence/drizzle-code-affix.repository';
import { CodeAffixesController } from './presentation/code-affixes.controller';

@Module({
  controllers: [CodeAffixesController],
  providers: [
    { provide: CODE_AFFIX_REPOSITORY, useClass: DrizzleCodeAffixRepository },
    ListCodeAffixesUseCase,
    CreateCodeAffixUseCase,
    UpdateCodeAffixUseCase,
    ValidateCodeAffixUseCase,
    DeactivateCodeAffixUseCase,
    ParseProductCodeUseCase,
  ],
})
export class CodeAffixesModule {}
