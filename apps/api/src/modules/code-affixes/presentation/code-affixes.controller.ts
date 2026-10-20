import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CodeAffixDto,
  type CodeAffixListQuery,
  type CreateCodeAffixInput,
  type ParseProductCodeInput,
  type ParsedProductCodeDto,
  type UpdateCodeAffixInput,
  type ValidateCodeAffixInput,
  codeAffixListQuerySchema,
  codeAffixSchema,
  createCodeAffixSchema,
  parseProductCodeSchema,
  parsedProductCodeSchema,
  updateCodeAffixSchema,
  validateCodeAffixSchema,
} from '@cdr/contracts';

import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { openApiSchema } from '../../../shared/http/openapi';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  CreateCodeAffixUseCase,
  DeactivateCodeAffixUseCase,
  ListCodeAffixesUseCase,
  ParseProductCodeUseCase,
  UpdateCodeAffixUseCase,
  ValidateCodeAffixUseCase,
} from '../application/manage-code-affixes.use-cases';
import { toCodeAffixDto, toParsedProductCodeDto } from './code-affix.presenter';

@ApiTags('code affixes')
@Controller('code-affixes')
export class CodeAffixesController {
  constructor(
    private readonly listRules: ListCodeAffixesUseCase,
    private readonly createRule: CreateCodeAffixUseCase,
    private readonly updateRule: UpdateCodeAffixUseCase,
    private readonly validateRule: ValidateCodeAffixUseCase,
    private readonly deactivateRule: DeactivateCodeAffixUseCase,
    private readonly parseCode: ParseProductCodeUseCase,
  ) {}

  @Get()
  @RequireCapabilities(Capability.AdministrationManage)
  @ApiOperation({ summary: 'List persisted code-prefix, suffix, series and pattern rules' })
  @ApiOkResponse({ schema: openApiSchema(codeAffixSchema.array()) })
  async list(
    @Query(new ZodValidationPipe(codeAffixListQuerySchema)) query: CodeAffixListQuery,
  ): Promise<CodeAffixDto[]> {
    return (await this.listRules.execute(query)).map(toCodeAffixDto);
  }

  @Post('parse')
  @RequireCapabilities(Capability.AttributesRead)
  @ApiOperation({ summary: 'Parse a product code using validated persisted rules only' })
  @ApiOkResponse({ schema: openApiSchema(parsedProductCodeSchema) })
  async parse(
    @Body(new ZodValidationPipe(parseProductCodeSchema)) body: ParseProductCodeInput,
  ): Promise<ParsedProductCodeDto> {
    return toParsedProductCodeDto(await this.parseCode.execute(body));
  }

  @Post()
  @RequireCapabilities(Capability.AdministrationManage)
  async create(
    @Body(new ZodValidationPipe(createCodeAffixSchema)) body: CreateCodeAffixInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<CodeAffixDto> {
    return toCodeAffixDto(await this.createRule.execute(body, actor));
  }

  @Patch(':id')
  @RequireCapabilities(Capability.AdministrationManage)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCodeAffixSchema)) body: UpdateCodeAffixInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<CodeAffixDto> {
    return toCodeAffixDto(await this.updateRule.execute(id, body, actor));
  }

  @Post(':id/validation')
  @RequireCapabilities(Capability.AdministrationManage)
  async validate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(validateCodeAffixSchema)) body: ValidateCodeAffixInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<CodeAffixDto> {
    return toCodeAffixDto(await this.validateRule.execute(id, body, actor));
  }

  @Delete(':id')
  @RequireCapabilities(Capability.AdministrationManage)
  @ApiOperation({ summary: 'Deactivate a code-affix rule while retaining its audit history' })
  async deactivate(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<CodeAffixDto> {
    return toCodeAffixDto(await this.deactivateRule.execute(id, actor));
  }
}
