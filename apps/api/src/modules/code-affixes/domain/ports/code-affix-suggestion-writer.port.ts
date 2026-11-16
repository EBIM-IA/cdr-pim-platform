import type { AuthenticatedActor } from '../../../identity/domain/entities/role';
import type { CodeAffix, EditableCodeAffix } from '../entities/code-affix';
/** Published capture capability; generated candidates remain pending human validation. */
export interface CodeAffixSuggestionWriterPort {
  execute(input: EditableCodeAffix, actor: AuthenticatedActor): Promise<CodeAffix>;
}
export const CODE_AFFIX_SUGGESTION_WRITER = Symbol('CodeAffixSuggestionWriterPort');
