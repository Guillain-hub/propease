import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { FilesController } from './files.controller.js';
import { ObjectStorageService } from './object-storage.service.js';

@Module({
  imports: [AuthModule, OrganisationsModule],
  controllers: [FilesController],
  providers: [ObjectStorageService],
})
export class FilesModule {}
