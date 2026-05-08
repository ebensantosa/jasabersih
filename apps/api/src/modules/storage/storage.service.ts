import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

export type BucketKind = 'private' | 'public';

@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly buckets: Record<BucketKind, string>;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.getOrThrow<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
    this.buckets = {
      private: config.getOrThrow<string>('R2_BUCKET_PRIVATE'),
      public: config.getOrThrow<string>('R2_BUCKET_PUBLIC'),
    };
    this.publicBaseUrl = config.getOrThrow<string>('R2_PUBLIC_BASE_URL').replace(/\/$/, '');
  }

  // Used by KYC/evidence upload (admin or user). Returns presigned PUT URL —
  // client uploads file directly to R2, we never proxy bytes through the API.
  async createUploadUrl(opts: {
    bucket: BucketKind;
    keyPrefix: string;
    contentType: string;
    expiresInSec?: number;
  }): Promise<{ uploadUrl: string; key: string }> {
    const ext = guessExt(opts.contentType);
    const key = `${opts.keyPrefix}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.buckets[opts.bucket],
        Key: key,
        ContentType: opts.contentType,
      }),
      { expiresIn: opts.expiresInSec ?? 300 },
    );
    return { uploadUrl, key };
  }

  // Short-lived signed read URL for private files (KYC docs, dispute evidence).
  // Default 5 min — admin reloads page, link auto-expires.
  async getSignedReadUrl(bucket: BucketKind, key: string, expiresInSec = 300): Promise<string> {
    if (bucket === 'public') return this.getPublicUrl(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      { expiresIn: expiresInSec },
    );
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key.replace(/^\//, '')}`;
  }

  async deleteObject(bucket: BucketKind, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: key }));
  }
}

function guessExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'application/pdf': return '.pdf';
    default: return '';
  }
}
