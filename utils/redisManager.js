import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

class RedisManager {
  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.client.on('error', (err) => console.log('Redis Client Error', err));
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async disconnect() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async set(key, value, expiration = 3600) {
    await this.connect();
    await this.client.set(key, JSON.stringify(value), {
      EX: expiration
    });
  }

  async get(key) {
    await this.connect();
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async del(key) {
    await this.connect();
    await this.client.del(key);
  }

  async setHash(key, field, value) {
    await this.connect();
    await this.client.hSet(key, field, JSON.stringify(value));
  }

  async getHash(key, field) {
    await this.connect();
    const value = await this.client.hGet(key, field);
    return value ? JSON.parse(value) : null;
  }

  async getAllHash(key) {
    await this.connect();
    const hash = await this.client.hGetAll(key);
    Object.keys(hash).forEach(field => {
      hash[field] = JSON.parse(hash[field]);
    });
    return hash;
  }

  async delHash(key, field) {
    await this.connect();
    await this.client.hDel(key, field);
  }

  // 新增：设置时间锁,duration:60 秒
  async setTimeLock(key, duration) {
    await this.connect();
    const result = await this.client.set(key, 'locked', {
      NX: true,
      EX: duration
    });
    return result === 'OK';
  }

  // 新增：检查时间锁是否存在
  async checkTimeLock(key) {
    await this.connect();
    const value = await this.client.get(key);
    return value !== null;
  }
}

const redisManager = new RedisManager();

export default redisManager;