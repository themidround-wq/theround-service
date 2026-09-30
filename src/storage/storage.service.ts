import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';

const URL_TTL_SECONDS = 15 * 60;

/**
 * Audio store. Uses an S3-compatible bucket (Cloudflare R2) when S3_* vars are
 * set, otherwise falls back to local disk for development.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get('UPLOAD_DIR', 'uploads'));
    this.bucket = config.get('S3_BUCKET', '');
    const endpoint = config.get<string>('S3_ENDPOINT');
    this.s3 = endpoint
      ? new S3Client({
          region: 'auto', // R2 ignores the region but the SDK requires one
          endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.getOrThrow('S3_ACCESS_KEY_ID'),
            secretAccessKey: config.getOrThrow('S3_SECRET_ACCESS_KEY'),
          },
        })
      : null;
    this.logger.log(
      this.s3
        ? `Audio storage: bucket ${this.bucket}`
        : 'Audio storage: local disk',
    );
  }

  get isRemote() {
    return this.s3 !== null;
  }

  async save(key: string, data: Buffer, contentType: string) {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      );
    } else {
      const path = join(this.root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    }
    return key;
  }

  /** Short-lived signed URL for a remote object (R2/S3 handles Range requests). */
  signedUrl(key: string, contentType: string) {
    return getSignedUrl(
      this.s3!,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: contentType,
      }),
      { expiresIn: URL_TTL_SECONDS },
    );
  }

  localPath(key: string) {
    return join(this.root, key);
  }

  async remove(key: string) {
    if (this.s3) {
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
        .catch((e) => this.logger.warn(`Failed to delete ${key}: ${e}`));
    } else {
      await unlink(this.localPath(key)).catch(() => undefined);
    }
  }
}
