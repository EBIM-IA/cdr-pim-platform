import { CODE_AFFIX_SUGGESTION_WRITER } from './domain/ports/code-affix-suggestion-writer.port';
import { BulkValidateCodeAffixesUseCase } from './application/bulk-validate-code-affixes.use-case';
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
    BulkValidateCodeAffixesUseCase,
    CreateCodeAffixUseCase,
    { provide: CODE_AFFIX_SUGGESTION_WRITER, useExisting: CreateCodeAffixUseCase },
    UpdateCodeAffixUseCase,
    ValidateCodeAffixUseCase,
    DeactivateCodeAffixUseCase,
    ParseProductCodeUseCase,
  ],
  exports: [CODE_AFFIX_REPOSITORY, CODE_AFFIX_SUGGESTION_WRITER],
})
export class CodeAffixesModule {}
