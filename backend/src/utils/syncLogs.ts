export const MAX_SYNC_LOG_ENTRIES = 300;

export interface SyncLogEntry {
  time: string;
  level: "info" | "warn" | "error";
  message: string;
}

export const serializeSyncLogs = (logs: SyncLogEntry[]): string =>
  JSON.stringify(logs.slice(-MAX_SYNC_LOG_ENTRIES));

export const readRecentSyncLogs = async (db: D1Database, sessionId: string): Promise<SyncLogEntry[]> => {
  const { results } = await db
    .prepare(
      `SELECT entry.value AS value
       FROM SyncSession, json_each(SyncSession.logs) AS entry
       WHERE SyncSession.id = ?
       ORDER BY entry.key DESC
       LIMIT ?`
    )
    .bind(sessionId, MAX_SYNC_LOG_ENTRIES)
    .all<{ value: string }>();
  return results.map((row) => JSON.parse(row.value) as SyncLogEntry).reverse();
};
