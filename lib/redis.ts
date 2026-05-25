import { Redis as UpstashRedis } from '@upstash/redis';
import { hashPassword } from './auth';

// Project identifier to avoid key conflicts when sharing Redis database
const PROJECT_ID = process.env.REDIS_PROJECT_ID || 'ppcstockman';

interface RedisStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  hGet(hashKey: string, field: string): Promise<string | null>;
  hSet(hashKey: string, field: string, value: string): Promise<unknown>;
  hGetAll(hashKey: string): Promise<Record<string, string>>;
  del(key: string): Promise<unknown>;
  sAdd(setKey: string, member: string): Promise<unknown>;
  sMembers(setKey: string): Promise<string[]>;
  sRem(setKey: string, member: string): Promise<unknown>;
  sIsMember(setKey: string, member: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  zAdd(key: string, score: number, member: string): Promise<unknown>;
  zRangeByScore(key: string, min: number, max: number): Promise<Array<{ value: string; score: number }>>;
}

function prefixKey(key: string): string {
  return `${PROJECT_ID}:${key}`;
}

function wrapUpstashClient(client: UpstashRedis): RedisStorage {
  return {
    get: (key: string) => client.get(prefixKey(key)),
    set: (key: string, value: string) => client.set(prefixKey(key), value),
    hGet: async (hashKey: string, field: string) => {
      const result = await client.hget(prefixKey(hashKey), field);
      return typeof result === 'string' ? result : null;
    },
    hSet: async (hashKey: string, field: string, value: string) => {
      await client.hset(prefixKey(hashKey), { [field]: value });
    },
    hGetAll: async (hashKey: string) => {
      const result = await client.hgetall<Record<string, string>>(prefixKey(hashKey));
      return result ?? {};
    },
    del: (key: string) => client.del(prefixKey(key)),
    sAdd: async (setKey: string, member: string) => {
      await client.sadd(prefixKey(setKey), member);
    },
    sMembers: async (setKey: string) => {
      // Upstash client may return a single string or an array; normalize to string[]
      const result = await (client as any).smembers(prefixKey(setKey));
      if (!result) return [];
      return Array.isArray(result) ? result : [String(result)];
    },
    sRem: async (setKey: string, member: string) => {
      await client.srem(prefixKey(setKey), member);
    },
    sIsMember: async (setKey: string, member: string) => {
      const result = await client.sismember(prefixKey(setKey), member);
      return Boolean(result);
    },
    incr: async (key: string) => {
      const result = await client.incr(prefixKey(key));
      return typeof result === 'number' ? result : parseInt(String(result), 10);
    },
    zAdd: async (key: string, score: number, member: string) => {
      // Use a hash as a portable sorted-set fallback: member => score
      await client.hset(prefixKey(key), { [member]: score.toString() });
    },
    zRangeByScore: async (key: string, min: number, max: number) => {
      // Read all entries from the hash and filter by score
      const all = await client.hgetall<Record<string, string>>(prefixKey(key));
      if (!all) return [];
      const result: Array<{ value: string; score: number }> = [];
      for (const member in all) {
        const score = parseFloat(all[member]);
        if (!Number.isNaN(score) && score >= min && score <= max) {
          result.push({ value: member, score });
        }
      }
      return result.sort((a, b) => a.score - b.score);
    }
  };
}

class MockRedis implements RedisStorage {
  private data: Map<string, any> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  private hashes: Map<string, Map<string, any>> = new Map();

  async get(key: string): Promise<string | null> {
    const value = this.data.get(key);
    return value !== undefined ? value : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async hGet(hashKey: string, field: string): Promise<string | null> {
    const hash = this.hashes.get(hashKey);
    return hash ? (hash.get(field) ?? null) : null;
  }

  async hSet(hashKey: string, field: string, value: string): Promise<void> {
    if (!this.hashes.has(hashKey)) {
      this.hashes.set(hashKey, new Map());
    }
    this.hashes.get(hashKey)!.set(field, value);
  }

  async hGetAll(hashKey: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(hashKey);
    if (!hash) return {};
    const result: Record<string, string> = {};
    hash.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
    this.hashes.delete(key);
    this.sets.delete(key);
  }

  async sAdd(setKey: string, member: string): Promise<void> {
    if (!this.sets.has(setKey)) {
      this.sets.set(setKey, new Set());
    }
    this.sets.get(setKey)!.add(member);
  }

  async sMembers(setKey: string): Promise<string[]> {
    const set = this.sets.get(setKey);
    return set ? Array.from(set) : [];
  }

  async sRem(setKey: string, member: string): Promise<void> {
    this.sets.get(setKey)?.delete(member);
  }

  async sIsMember(setKey: string, member: string): Promise<boolean> {
    const set = this.sets.get(setKey);
    return set ? set.has(member) : false;
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (current ? parseInt(current, 10) : 0) + 1;
    await this.set(key, newValue.toString());
    return newValue;
  }

  async zAdd(key: string, score: number, member: string): Promise<void> {
    await this.hSet(key, member, score.toString());
  }

  async zRangeByScore(key: string, min: number, max: number): Promise<Array<{ value: string; score: number }>> {
    const hash = this.hashes.get(key);
    if (!hash) return [];
    const result: Array<{ value: string; score: number }> = [];
    hash.forEach((scoreStr, member) => {
      const score = parseFloat(scoreStr);
      if (score >= min && score <= max) {
        result.push({ value: member, score });
      }
    });
    return result.sort((a, b) => a.score - b.score);
  }
}

let exportedRedis: RedisStorage;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const client = new UpstashRedis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  exportedRedis = wrapUpstashClient(client);
} else {
  exportedRedis = new MockRedis();

  // Development-only: seed a known super admin when using the in-memory MockRedis.
  (async () => {
    try {
      const existing = await exportedRedis.get('user:username:admin');
      if (!existing) {
        const adminId = 'user:admin_001';
        const hashed = await hashPassword('password123');

        await exportedRedis.hSet(`user:${adminId}`, 'id', adminId);
        await exportedRedis.hSet(`user:${adminId}`, 'username', 'admin');
        await exportedRedis.hSet(`user:${adminId}`, 'email', 'admin@ppcstock.local');
        await exportedRedis.hSet(`user:${adminId}`, 'role', 'super_admin');
        await exportedRedis.hSet(`user:${adminId}`, 'passwordHash', hashed);
        await exportedRedis.hSet(`user:${adminId}`, 'createdAt', new Date().toISOString());
        await exportedRedis.hSet(`user:${adminId}`, 'updatedAt', new Date().toISOString());
        await exportedRedis.hSet(`user:${adminId}`, 'isActive', 'true');

        await exportedRedis.set('user:username:admin', adminId);
        await exportedRedis.sAdd('users', adminId);

        // Friendly console hint for local development
        // eslint-disable-next-line no-console
        console.log('Seeded dev super admin -> username: admin  password: password123');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error seeding dev admin user:', err);
    }
  })();
}

export default exportedRedis;
