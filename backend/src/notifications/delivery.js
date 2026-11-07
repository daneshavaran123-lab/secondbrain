// Sends due deliveries on the channels the person chose (research R6): browser push (Web Push),
// phone push (Firebase Cloud Messaging), SMS and email. Each delivery row is sent at most once;
// a failure is retried up to 3 times; a device the push service no longer knows is turned off.
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { query } from '../db/index.js';
import { sendSms, smsConfigured } from '../utils/sms.js';
import { emailConfigured, sendNotificationEmail } from '../utils/email.js';
import { smsText } from './schedule.js';

const MAX_ATTEMPTS = 3;
const siteUrl = () => (process.env.SITE_URL || '').replace(/\/$/, '');

class Gone extends Error {}
class Skip extends Error {}

// ─── Web Push ────────────────────────────────────────────────────────────────
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;
let vapidReady = false;
function vapid() {
  if (vapidReady) return true;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject || 'mailto:admin@localhost', pub, priv);
  vapidReady = true;
  return true;
}

async function sendWebPush(device, payload) {
  if (!vapid()) throw new Skip('اعلان مرورگر پیکربندی نشده است');
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(payload), { TTL: 24 * 60 * 60 });
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) throw new Gone(`push ${err.statusCode}`);
    throw err;
  }
}

// ─── Firebase Cloud Messaging (HTTP v1) ──────────────────────────────────────
let fcmToken = null;
function serviceAccount() {
  try {
    return process.env.FCM_SERVICE_ACCOUNT ? JSON.parse(process.env.FCM_SERVICE_ACCOUNT) : null;
  } catch {
    return null;
  }
}

async function fcmAccessToken(account) {
  if (fcmToken && fcmToken.expires > Date.now() + 60_000) return fcmToken.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: account.token_uri, iat: now, exp: now + 3600 },
    account.private_key, { algorithm: 'RS256' },
  );
  const res = await fetch(account.token_uri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`fcm token ${res.status}`);
  const data = await res.json();
  fcmToken = { value: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return fcmToken.value;
}

async function sendFcm(device, payload) {
  const account = serviceAccount();
  if (!account) throw new Skip('اعلان گوشی پیکربندی نشده است');
  const base = (process.env.FCM_API_BASE || 'https://fcm.googleapis.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await fcmAccessToken(account)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: device.endpoint,
        notification: { title: payload.title, body: payload.body || '' },
        data: { path: payload.path || '/', tag: payload.tag },
        android: { notification: { tag: payload.tag } },
      },
    }),
  });
  if (res.status === 404 || res.status === 410) throw new Gone(`fcm ${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    if (/UNREGISTERED|NOT_FOUND/.test(text)) throw new Gone('fcm unregistered');
    throw new Error(`fcm ${res.status}`);
  }
}

// ─── Channels ────────────────────────────────────────────────────────────────
async function push(n) {
  const { rows: devices } = await query('SELECT * FROM notification_devices WHERE user_id = $1 AND disabled_at IS NULL', [n.user_id]);
  if (!devices.length) throw new Skip('دستگاهی برای اعلان ثبت نشده است');
  const payload = { title: n.title, body: n.body, path: n.path || '/', tag: n.id };
  let sent = 0;
  let lastError = null;
  for (const device of devices) {
    try {
      await (device.kind === 'fcm' ? sendFcm : sendWebPush)(device, payload);
      sent += 1;
      await query('UPDATE notification_devices SET last_ok_at = NOW() WHERE id = $1', [device.id]);
    } catch (err) {
      if (err instanceof Gone) await query('UPDATE notification_devices SET disabled_at = NOW() WHERE id = $1', [device.id]);
      else {
        lastError = err;
        console.warn(`[notify] push to a ${device.kind} device failed:`, err.message);
      }
    }
  }
  if (sent) return;
  if (lastError) throw lastError;
  throw new Skip('دستگاه‌های ثبت‌شده دیگر اعلان نمی‌پذیرند');
}

async function sms(n) {
  if (!smsConfigured()) throw new Skip('پیامک پیکربندی نشده است');
  const { rows } = await query(`SELECT COALESCE(NULLIF(mobile_phone, ''), NULLIF(phone, '')) AS phone FROM user_profiles WHERE user_id = $1`, [n.user_id]);
  const phone = rows[0]?.phone;
  if (!phone) throw new Skip('شماره همراه در پروفایل ثبت نشده است');
  await sendSms(phone, smsText(n, siteUrl()));
}

async function email(n) {
  if (!emailConfigured()) throw new Skip('ایمیل پیکربندی نشده است');
  const { rows } = await query('SELECT email FROM users WHERE id = $1', [n.user_id]);
  if (!rows[0]?.email) throw new Skip('ایمیلی ثبت نشده است');
  await sendNotificationEmail(rows[0].email, { title: n.title, link: siteUrl() ? `${siteUrl()}${n.path || '/'}` : null });
}

const SENDERS = { push, sms, email };

/** Sends every delivery that is due. Returns counts by result. */
export async function deliverDue(now = new Date()) {
  const { rows } = await query(
    `SELECT d.id AS delivery_id, d.channel, d.attempts, n.*
       FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
      WHERE d.status = 'pending' AND d.deliver_after <= $1
      ORDER BY d.deliver_after LIMIT 200`, [now]);
  const counts = { sent: 0, failed: 0, skipped: 0, retry: 0 };
  for (const row of rows) {
    let status = 'sent';
    let error = null;
    try {
      await SENDERS[row.channel](row);
    } catch (err) {
      error = String(err.message || err).slice(0, 300);
      status = err instanceof Skip ? 'skipped' : row.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
    }
    await query(
      `UPDATE notification_deliveries SET status = $2, attempts = attempts + 1, error = $3, updated_at = NOW(),
              sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
              deliver_after = CASE WHEN $2 = 'pending' THEN NOW() + interval '1 minute' ELSE deliver_after END
        WHERE id = $1`, [row.delivery_id, status, error]);
    counts[status === 'pending' ? 'retry' : status] += 1;
  }
  return counts;
}
