import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  categoryTreeConfirmSchema,
  categoryTreeImportSchema,
  saveCategoryDynamicAttributeSchema,
  type CategoryTreeImportRow,
  type SaveCategoryDynamicAttribute,
} from '@cdr/contracts';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { CategoryGovernanceUseCase } from '../application/category-governance.use-case';
@Controller('catalog/admin/category-governance')
@RequireCapabilities(Capability.AdministrationManage)
export class CategoryGovernanceController {
  constructor(private readonly governance: CategoryGovernanceUseCase) {}
  @Get() read() {
    return this.governance.read();
  }
  @Post('tree/preview') preview(
    @Body(new ZodValidationPipe(categoryTreeImportSchema)) body: { rows: CategoryTreeImportRow[] },
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.governance.importTree(body.rows, false, actor);
  }
  @Post('tree/confirm') confirm(
    @Body(new ZodValidationPipe(categoryTreeConfirmSchema))
    body: { rows: CategoryTreeImportRow[]; expectedRevision: string },
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.governance.importTree(body.rows, true, actor, body.expectedRevision);
  }
  @Post('attributes') save(
    @Body(new ZodValidationPipe(saveCategoryDynamicAttributeSchema))
    body: SaveCategoryDynamicAttribute,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.governance.saveDynamicAttribute(body, actor);
  }
}
