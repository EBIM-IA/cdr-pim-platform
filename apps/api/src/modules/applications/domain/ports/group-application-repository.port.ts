import type { Uuid } from '@cdr/shared';

import type { GroupApplication } from '../entities/group-application';

export interface ApplicationCriteria {
  readonly unifiedCode?: string;
  readonly productId?: Uuid;
  readonly includeInactive: boolean;
}

export interface GroupApplicationRepositoryPort {
  findGroupByCode(code: string): Promise<{ id: Uuid; code: string } | null>;
  findById(id: Uuid): Promise<GroupApplication | null>;
  list(criteria: ApplicationCriteria): Promise<GroupApplication[]>;
  save(application: GroupApplication): Promise<void>;
}

export const GROUP_APPLICATION_REPOSITORY = Symbol('GroupApplicationRepositoryPort');
