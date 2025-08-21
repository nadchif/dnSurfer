import { createClient } from 'redis';


export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
});
redis.on('error', (err) => console.error('[redis] error', err.message));
redis.on('connect', () => {
  console.log('[redis] connected');
  redis.flushAll();
});
redis
  .connect()
  .catch((err) => console.error('[redis] connect failed', err.message));

export const resourceCacheGet = async (key) => {
  try {
    const v = await redis.get(key);
    if (v) return JSON.parse(v);
  } catch {}
};

export const resourceCacheSet = async (key, value, ttlSec) => {
  if (!ttlSec) return;
  const payload = JSON.stringify(value);
  try {
    await redis.set(key, payload, { EX: ttlSec });
  } catch {}
};
