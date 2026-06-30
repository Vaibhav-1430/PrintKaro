import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_CONVERTER_PORT,
  type ConversionResult,
  type FileConverterPort,
} from './converter.port';

/**
 * Thin service wrapper over the injected FileConverterPort so the UploadService
 * depends on a Nest provider rather than a token directly. Keeps the original
 * source object; returns the print-ready PDF key.
 */
@Injectable()
export class FileConversionService {
  constructor(@Inject(FILE_CONVERTER_PORT) private readonly converter: FileConverterPort) {}

  get driver(): string {
    return this.converter.driver;
  }

  needsConversion(mimeType: string): boolean {
    return this.converter.needsConversion(mimeType);
  }

  convert(sourceKey: string, mimeType: string, targetKey: string): Promise<ConversionResult> {
    return this.converter.convert({ sourceKey, mimeType, targetKey });
  }
}
