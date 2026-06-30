import { Injectable } from '@nestjs/common';
import type { Prisma } from '@print-karo/database';
import { PrismaService } from '../prisma/prisma.service';

/** Sole data-access boundary for uploads + their extracted metadata. */
@Injectable()
export class UploadRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UploadUncheckedCreateInput) {
    return this.prisma.client.upload.create({ data });
  }

  findById(id: string) {
    return this.prisma.client.upload.findFirst({
      where: { id, deletedAt: null },
      include: { metadata: true },
    });
  }

  /** Existing non-rejected upload with the same content hash for this customer. */
  findDuplicate(customerProfileId: string, sha256: string) {
    return this.prisma.client.upload.findFirst({
      where: {
        customerProfileId,
        sha256,
        deletedAt: null,
        status: { not: 'REJECTED' },
      },
      include: { metadata: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForCustomer(customerProfileId: string, take = 50) {
    return this.prisma.client.upload.findMany({
      where: { customerProfileId, deletedAt: null },
      include: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  update(id: string, data: Prisma.UploadUncheckedUpdateInput) {
    return this.prisma.client.upload.update({ where: { id }, data });
  }

  upsertMetadata(
    uploadId: string,
    data: Omit<Prisma.FileMetadataUncheckedCreateInput, 'uploadId'>,
  ) {
    return this.prisma.client.fileMetadata.upsert({
      where: { uploadId },
      create: { uploadId, ...data },
      update: data,
    });
  }
}
