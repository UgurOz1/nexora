import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { realtimeOrigins } from '../realtime/realtime.adapter';

export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  size: number;
}

const UPLOAD_LINK_SECONDS = 300;
const DOWNLOAD_LINK_SECONDS = 60;

// The only place that talks to object storage. Files travel straight between the browser and the
// storage server: the API hands out short-lived, signed links and checks what arrived, but never
// carries the bytes itself (so large uploads cost the API nothing, and it cannot be slowed down by
// them).
@Injectable()
export class StorageService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(StorageService.name);
  // Two clients, one account: `internal` is what the API calls itself; `signer` signs links for
  // BROWSERS and so must use the address browsers reach (S3_PUBLIC_ENDPOINT).
  private readonly internal: S3Client;
  private readonly signer: S3Client;
  private readonly bucket: string;
  private readonly origins: string[];

  constructor(config: ConfigService<Env, true>) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const base: S3ClientConfig = {
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: true, // http://host/bucket/key, which works with every S3-compatible server
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
      // Newer SDKs add a checksum of the (still unknown) body to every signed link, which makes
      // the upload fail on servers that do not know that extension. Only when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    };
    this.internal = new S3Client({ ...base, endpoint });
    this.signer = new S3Client({
      ...base,
      endpoint: config.get('S3_PUBLIC_ENDPOINT', { infer: true }) ?? endpoint,
    });
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.origins = realtimeOrigins(
      config.get('APP_URL', { infer: true }),
      config.get('NODE_ENV', { infer: true }),
    );
  }

  // Creates the bucket (and lets the web app's origin call it) if needed. The API still starts
  // when storage is down; attachment requests then fail until it is back.
  async onModuleInit() {
    try {
      await this.ensureBucket();
    } catch (error) {
      this.logger.error({ err: error }, 'Object storage is not available; uploads will fail');
    }
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    // Browsers upload and download directly, which is a cross-origin request: the storage server
    // must say that the web app is allowed to do it.
    await this.internal.send(
      new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: this.origins,
              AllowedMethods: ['PUT', 'GET'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 600,
            },
          ],
        },
      }),
    );
  }

  // A link that lets the browser PUT ONE file to ONE key for five minutes. The type and the
  // exact size are part of what is signed: storage refuses (403) a different type or length, so
  // the limits are enforced by the storage server itself, not only by our later checks.
  async presignUpload(options: {
    key: string;
    contentType: string;
    size: number;
  }): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        ContentType: options.contentType,
        ContentLength: options.size,
      }),
      {
        expiresIn: UPLOAD_LINK_SECONDS,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return {
      url,
      headers: { 'Content-Type': options.contentType },
      expiresAt: new Date(Date.now() + UPLOAD_LINK_SECONDS * 1000),
    };
  }

  // A one-minute link to read one file. It always says "attachment" (save it, never show it in
  // the page) and carries OUR checked content type, so a file can never be served as a web page
  // or script from the storage address, whatever its bytes look like.
  async presignDownload(options: {
    key: string;
    fileName: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const url = await getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        ResponseContentDisposition: contentDisposition(options.fileName),
        ResponseContentType: options.contentType,
      }),
      { expiresIn: DOWNLOAD_LINK_SECONDS },
    );
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_LINK_SECONDS * 1000) };
  }

  // What storage says about the object, or null when it is not there.
  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.internal.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { size: result.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  // The first `length` bytes, to check what a file really is.
  async readStart(key: string, length: number): Promise<Buffer> {
    const result = await this.internal.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${length - 1}` }),
    );
    return Buffer.from((await result.Body?.transformToByteArray()) ?? []);
  }

  async delete(key: string): Promise<void> {
    await this.internal.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  // Everything under a prefix (used when a whole organization is deleted).
  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.internal.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length > 0) {
        await this.internal.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }),
        );
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  async list(prefix: string): Promise<string[]> {
    const page = await this.internal.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
    );
    return (page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : []));
  }

  onApplicationShutdown() {
    this.internal.destroy();
    this.signer.destroy();
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}

// `attachment; filename="plain.txt"; filename*=UTF-8''percent-encoded`: the first for old
// clients (ASCII only, anything else replaced), the second carries the real name.
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
