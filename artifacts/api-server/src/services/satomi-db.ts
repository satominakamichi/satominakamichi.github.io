import { pool } from "@workspace/db";

export interface ChatEntry {
  username: string;
  question: string;
  response: string;
  timestamp: number;
}

export async function initChatLogTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS satomi_chat_log (
      id        SERIAL PRIMARY KEY,
      username  TEXT NOT NULL,
      question  TEXT NOT NULL,
      response  TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function saveChatLog(entry: ChatEntry): Promise<void> {
  await pool.query(
    `INSERT INTO satomi_chat_log (username, question, response, created_at)
     VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
    [entry.username, entry.question, entry.response, entry.timestamp],
  );
}

export async function getRecentChatLog(limit = 5): Promise<ChatEntry[]> {
  const r = await pool.query<{
    username: string;
    question: string;
    response: string;
    created_at: Date;
  }>(
    `SELECT username, question, response, created_at
     FROM satomi_chat_log
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  return r.rows
    .reverse() // oldest first so UI renders in correct order
    .map((row) => ({
      username:  row.username,
      question:  row.question,
      response:  row.response,
      timestamp: row.created_at.getTime(),
    }));
}
