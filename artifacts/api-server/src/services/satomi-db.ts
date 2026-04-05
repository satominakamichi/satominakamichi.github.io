import { pool } from "@workspace/db";

export interface ChatEntry {
  username:  string;
  question:  string;
  response:  string;
  timestamp: number;
  avatarUrl?: string;
}

export async function initChatLogTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS satomi_chat_log (
      id         SERIAL PRIMARY KEY,
      username   TEXT NOT NULL,
      question   TEXT NOT NULL,
      response   TEXT NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add avatar_url column if table already existed without it
  await pool.query(`
    ALTER TABLE satomi_chat_log
    ADD COLUMN IF NOT EXISTS avatar_url TEXT
  `);
}

export async function saveChatLog(entry: ChatEntry): Promise<void> {
  await pool.query(
    `INSERT INTO satomi_chat_log (username, question, response, avatar_url, created_at)
     VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
    [entry.username, entry.question, entry.response, entry.avatarUrl ?? null, entry.timestamp],
  );
}

export async function getRecentChatLog(limit = 5): Promise<ChatEntry[]> {
  const r = await pool.query<{
    username:   string;
    question:   string;
    response:   string;
    avatar_url: string | null;
    created_at: Date;
  }>(
    `SELECT username, question, response, avatar_url, created_at
     FROM satomi_chat_log
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  return r.rows
    .reverse()
    .map((row) => ({
      username:  row.username,
      question:  row.question,
      response:  row.response,
      avatarUrl: row.avatar_url ?? undefined,
      timestamp: row.created_at.getTime(),
    }));
}
