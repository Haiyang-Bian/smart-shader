import { getDb } from '../utils/db'

export default defineNitroPlugin(() => {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      image TEXT,
      reasoning TEXT,
      shader_code TEXT,
      tool_calls TEXT,
      raw_response TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

    CREATE TABLE IF NOT EXISTS shared_shaders (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      views INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_shared_shaders_created_at ON shared_shaders(created_at DESC);
  `)
})
