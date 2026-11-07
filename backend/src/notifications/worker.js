// Every NOTIFY_TICK_MS (30 s by default): make what fell due into notifications, send due
// deliveries, and once a day remove notifications older than 90 days. An advisory lock keeps a
// second server from running the same pass at the same time (research R3).
import pool from '../db/index.js';
import { produce } from './producers.js';
import { deliverDue } from './delivery.js';

const LOCK_ID = 7_340_002;
let lastPurge = 0;
let running = false;

export async function tick(now = new Date()) {
  if (running) return null;
  running = true;
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
    if (!rows[0].ok) return null;
    try {
      const made = await produce(now);
      const sent = await deliverDue(now);
      if (Date.now() - lastPurge > 24 * 60 * 60 * 1000) {
        await client.query(`DELETE FROM notifications WHERE created_at < NOW() - interval '90 days'`);
        lastPurge = Date.now();
      }
      return { made, ...sent };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    }
  } catch (err) {
    console.warn('[notify] pass failed:', err.message);
    return null;
  } finally {
    client.release();
    running = false;
  }
}

export function startNotificationWorker() {
  const every = Math.max(Number(process.env.NOTIFY_TICK_MS) || 30_000, 1_000);
  const timer = setInterval(() => { void tick(); }, every);
  timer.unref?.();
  console.info(`[notify] checking every ${every / 1000}s`);
  return timer;
}
