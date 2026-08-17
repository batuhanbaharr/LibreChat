import { Model } from 'mongoose';
import type { IBlockSummary } from '~/types/blockSummary';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import blockSummarySchema from '~/schema/blockSummary';

export function createBlockSummaryModel(
  mongoose: typeof import('mongoose'),
): Model<IBlockSummary> {
  applyTenantIsolation(blockSummarySchema);
  return (
    mongoose.models.BlockSummary ||
    mongoose.model<IBlockSummary>('BlockSummary', blockSummarySchema)
  );
}
