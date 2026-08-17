import { Model } from 'mongoose';
import type { IBlockDecision } from '~/types/blockDecision';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import blockDecisionSchema from '~/schema/blockDecision';

export function createBlockDecisionModel(
  mongoose: typeof import('mongoose'),
): Model<IBlockDecision> {
  applyTenantIsolation(blockDecisionSchema);
  return (
    mongoose.models.BlockDecision ||
    mongoose.model<IBlockDecision>('BlockDecision', blockDecisionSchema)
  );
}
