import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UploadRepository } from './upload.repository';
import { FileValidationService } from './file-validation.service';
import { FileMetadataService } from './file-metadata.service';
import { FileConversionService } from './file-conversion.service';
import { VirusScanService } from './virus-scan.service';
import { UploadGateway } from './upload.gateway';
import { FILE_CONVERTER_PORT, type FileConverterPort } from './converter.port';
import { StubFileConverter } from './stub-file.converter';
import { LibreOfficeFileConverter } from './libreoffice-file.converter';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';

/**
 * Upload pipeline. The converter is selected by FILE_CONVERTER (default stub, so
 * the build/tests/boot stay green without LibreOffice). All other deps are
 * standard providers; StorageModule provides STORAGE_PORT globally.
 */
@Module({
  controllers: [UploadController],
  providers: [
    UploadService,
    UploadRepository,
    FileValidationService,
    FileMetadataService,
    FileConversionService,
    VirusScanService,
    UploadGateway,
    {
      provide: FILE_CONVERTER_PORT,
      inject: [ConfigService, STORAGE_PORT],
      useFactory: (config: ConfigService, storage: StoragePort): FileConverterPort => {
        const driver = config.get<string>('FILE_CONVERTER', 'stub');
        return driver === 'libreoffice'
          ? new LibreOfficeFileConverter(storage)
          : new StubFileConverter();
      },
    },
  ],
  exports: [UploadService, UploadRepository],
})
export class UploadModule {}
