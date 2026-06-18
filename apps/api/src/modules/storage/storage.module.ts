import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { StorageController } from './storage.controller';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [StorageController],
  providers: [StorageService, StorageCleanupService],
  exports: [StorageService],
})
export class StorageModule {}
