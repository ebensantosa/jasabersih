import { Global, Module } from '@nestjs/common';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService, StorageCleanupService],
  exports: [StorageService],
})
export class StorageModule {}
