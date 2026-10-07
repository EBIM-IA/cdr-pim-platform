import { describe, expect, it, vi } from 'vitest';

import { RATE_LIMIT_PROFILE } from '../../../shared/http/rate-limit';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  ExtractAssetCandidatesUseCase,
  GenerateCommercialProposalUseCase,
} from '../application/generate-ai-candidates.use-cases';
import { AiController } from './ai.controller';

const actor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'buyer@example.test',
  roles: [Role.Purchasing],
};

describe('AiController', () => {
  it('returns an explicitly unpersisted commercial proposal and delegates the actor', async () => {
    const execute = vi.fn().mockResolvedValue({
      productId: '10000000-0000-4000-8000-000000000001',
      sku: '6202-2RS',
      channel: 'b2c',
      model: 'gpt-6-luna',
      proposal: 'Propuesta para revisión.',
      inputTokens: 20,
      outputTokens: 8,
    });
    const controller = new AiController(
      { execute } as unknown as GenerateCommercialProposalUseCase,
      { execute: vi.fn() } as unknown as ExtractAssetCandidatesUseCase,
    );

    await expect(
      controller.commercialProposal(
        '10000000-0000-4000-8000-000000000001',
        { channel: 'b2c', maxOutputTokens: 320 },
        actor,
      ),
    ).resolves.toMatchObject({
      persisted: false,
      requiresHumanReview: true,
      usage: { inputTokens: 20, outputTokens: 8 },
    });
    expect(execute).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      { channel: 'b2c', maxOutputTokens: 320 },
      actor,
    );
  });

  it('applies the dedicated AI rate-limit profile to both provider-backed routes', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_PROFILE, AiController.prototype.commercialProposal)).toBe(
      'ai',
    );
    expect(
      Reflect.getMetadata(RATE_LIMIT_PROFILE, AiController.prototype.extractionCandidates),
    ).toBe('ai');
  });
});
