import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import { logger } from "../config/logger.js";
import type { ConversationMessage } from "../data/types.js";

const ttlSeconds = Number(process.env.CONVERSATION_TTL_SECONDS ?? 60 * 60 * 6);
const memoryStore = new Map<string, ConversationMessage[]>();

let redisClient: RedisClientType | null = null;
let redisReady = false;

export async function initializeConversationStore() {
  const client = await getRedisClient();

  if (client && redisReady) {
    logger.info({ store: "redis", ttlSeconds }, "conversation store ready");
    return;
  }

  logger.info({ store: "memory", ttlSeconds }, "conversation store ready");
}

async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    logger.info("REDIS_URL not configured, using in-memory conversation store");
    return null;
  }
  if (redisClient) return redisClient;

  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on("error", (error) => {
    redisReady = false;
    logger.warn({ error }, "redis connection error, using in-memory conversation store");
  });

  try {
    await redisClient.connect();
    redisReady = true;
    logger.info("redis conversation store connected");
    return redisClient;
  } catch (error) {
    redisReady = false;
    logger.warn({ error }, "redis unavailable, using in-memory conversation store");
    return null;
  }
}

function key(conversationId: string) {
  return `healtrip:conversation:${conversationId}`;
}

export async function loadConversation(conversationId?: string) {
  const id = conversationId || randomUUID();
  const client = await getRedisClient();

  if (client && redisReady) {
    const raw = await client.get(key(id));
    return {
      conversationId: id,
      messages: raw ? (JSON.parse(raw) as ConversationMessage[]) : [],
    };
  }

  return {
    conversationId: id,
    messages: memoryStore.get(id) ?? [],
  };
}

export async function saveConversation(conversationId: string, messages: ConversationMessage[]) {
  const client = await getRedisClient();

  if (client && redisReady) {
    await client.set(key(conversationId), JSON.stringify(messages), { EX: ttlSeconds });
    return;
  }

  memoryStore.set(conversationId, messages);
}
