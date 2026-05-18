import { timingSafeEqual } from 'crypto';

/**
 * Express middleware: require X-Hub-Secret header to match HUB_SECRET env var.
 * Timing-safe comparison prevents timing oracle attacks.
 * Returns 401 if the secret is missing, wrong, or if HUB_SECRET is not configured.
 */
export function requireSecret() {
  const secret = process.env.HUB_SECRET || '';
  if (!secret) {
    console.warn('[hub:auth] HUB_SECRET not set — /command and /scan are UNPROTECTED');
  }
  const secretBuf = Buffer.from(secret);
  return (req, res, next) => {
    if (!secret) return next(); // degraded: no secret configured, warn but allow
    const provided = String(req.headers['x-hub-secret'] || '');
    let valid = false;
    try {
      valid = provided.length > 0 &&
              provided.length === secret.length &&
              timingSafeEqual(Buffer.from(provided), secretBuf);
    } catch {}
    if (!valid) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    next();
  };
}

/**
 * Validate a hub secret string against HUB_SECRET.
 * Used by the WebSocket URL query-param check.
 */
export function isValidSecret(provided) {
  const secret = process.env.HUB_SECRET || '';
  if (!secret) return true; // degraded: allow all if unconfigured
  if (!provided || provided.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}
