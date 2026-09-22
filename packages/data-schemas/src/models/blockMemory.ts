import { Model } from 'mongoose';
import type { IBlockMemory } from '~/types/blockMemory';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import blockMemorySchema from '~/schema/blockMemory';

export function createBlockMemoryModel(mongoose: typeof import('mongoose')): Model<IBlockMemory> {
  applyTenantIsolation(blockMemorySchema);
  return (
    mongoose.models.BlockMemory || mongoose.model<IBlockMemory>('BlockMemory', blockMemorySchema)
  );
}
