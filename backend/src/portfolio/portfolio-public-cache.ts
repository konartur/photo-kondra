import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Redis } from 'ioredis';
import { AppLogger } from '../common/logging/app-logger.js';
import { QUEUE_CONFIG, type QueueInfrastructureConfig } from '../queues/queue.config.js';

const schema = 1;
const prefix = 'portfolio:public:v1:';
const fence = prefix + 'current';
const maxEntries = 64;
const maxBytes = 128 * 1024;

const readEntry = `
local v = redis.call('GET', KEYS[1])
if not v then return false end
return redis.call('HGET', ARGV[1] .. v, ARGV[2])
`;

// Version strings are padded to compare without Lua number rounding.
const advance = `
local old = redis.call('GET', KEYS[1])
if old and old > ARGV[2] then return 0 end
if old ~= ARGV[2] then
  if old then redis.call('UNLINK', ARGV[1] .. old) end
  redis.call('SET', KEYS[1], ARGV[2])
end
`;
const writeEntry =
  advance +
  `
local bucket = ARGV[1] .. ARGV[2]
local size = redis.call('HLEN', bucket)
if size >= tonumber(ARGV[6]) then return 0 end
redis.call('HSET', bucket, ARGV[3], ARGV[4])
if size == 0 then redis.call('EXPIRE', bucket, ARGV[5]) end
return 1
`;
const versionKey = (version: number | bigint) => version.toString().padStart(16, '0');

export type VersionedPortfolioDto = { contentVersion: number };
export type PortfolioCacheAddress = readonly (string | number | null)[];

function setting(config: ConfigService, name: string, fallback: number, min: number, max: number) {
  const value = Number(config.get<string>(name) ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid ' + name);
  return value;
}

@Injectable()
export class PortfolioPublicCache implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly ttl: number;
  private readonly secret: string;
  private readonly logger = new AppLogger(PortfolioPublicCache.name);

  constructor(config: ConfigService, @Inject(QUEUE_CONFIG) queue: QueueInfrastructureConfig) {
    this.ttl = setting(config, 'PORTFOLIO_CACHE_TTL', 60, 1, 600);
    const timeout = setting(config, 'PORTFOLIO_CACHE_TIMEOUT_MS', 100, 10, 1000);
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.client = new Redis({
      ...queue.connection,
      connectTimeout: timeout,
      commandTimeout: timeout,
      socketTimeout: timeout * 4,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      retryStrategy: (attempt) => Math.min(250 * attempt, 5000),
    });
    this.client.on('error', () => {
      // Commands emit their own bounded fallback event. Avoid repeated reconnect logs.
    });
  }

  private field(address: PortfolioCacheAddress) {
    return createHash('sha256').update(JSON.stringify(address)).digest('hex');
  }

  private sign(field: string, json: string) {
    return createHmac('sha256', this.secret).update(prefix).update(field).update(json).digest();
  }

  private fallback(error: unknown) {
    const timeout = error instanceof Error && error.message === 'Command timed out';
    this.logger.warn({ event: timeout ? 'portfolio_cache_timeout' : 'portfolio_cache_fallback' });
  }

  async get<T extends VersionedPortfolioDto>(address: PortfolioCacheAddress): Promise<T | null> {
    try {
      const field = this.field(address);
      const value = await this.client.eval(readEntry, 1, fence, prefix, field);
      if (typeof value !== 'string' || Buffer.byteLength(value) > maxBytes) return null;
      const mac = Buffer.from(value.slice(0, 64), 'hex');
      const json = value.slice(64);
      // Only DTOs produced by the public reader for this route and schema are accepted.
      if (mac.length !== 32 || !timingSafeEqual(mac, this.sign(field, json))) return null;
      const entry = JSON.parse(json) as { schema: number; data?: T };
      if (
        entry.schema !== schema ||
        !entry.data ||
        !Number.isSafeInteger(entry.data.contentVersion)
      )
        return null;
      return entry.data;
    } catch (error) {
      this.fallback(error);
      return null;
    }
  }

  async put(address: PortfolioCacheAddress, data: VersionedPortfolioDto) {
    const field = this.field(address);
    const json = JSON.stringify({ schema, data });
    const value = this.sign(field, json).toString('hex') + json;
    if (Buffer.byteLength(value) > maxBytes) return;
    try {
      await this.client.eval(
        writeEntry,
        1,
        fence,
        prefix,
        versionKey(data.contentVersion),
        field,
        value,
        this.ttl,
        maxEntries,
      );
    } catch (error) {
      this.fallback(error);
    }
  }

  async invalidate(version: bigint) {
    try {
      await this.client.eval(advance + 'return 1', 1, fence, prefix, versionKey(version));
    } catch (error) {
      this.fallback(error);
      throw error;
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
