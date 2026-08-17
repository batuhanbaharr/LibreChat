import { Model } from 'mongoose';
import type { IBlockTitle } from '~/types/blockTitle';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import blockTitleSchema from '~/schema/blockTitle';

export function createBlockTitleModel(mongoose: typeof import('mongoose')): Model<IBlockTitle> {
  applyTenantIsolation(blockTitleSchema);
  return mongoose.models.BlockTitle || mongoose.model<IBlockTitle>('BlockTitle', blockTitleSchema);
}
