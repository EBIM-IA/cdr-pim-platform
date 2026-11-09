import type { ProductExperienceDto } from '@cdr/contracts';
import type { AuthenticatedActor } from '../../../identity/domain/entities/role';
export interface ProductExperiencePort {
  experience(productId: string, actor: AuthenticatedActor): Promise<ProductExperienceDto>;
}
export const PRODUCT_EXPERIENCE = Symbol('ProductExperiencePort');
