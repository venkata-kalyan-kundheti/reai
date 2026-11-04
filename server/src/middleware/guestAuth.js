import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function guestAuth(req, res, next) {
  let id = req.signedCookies?.reai_guest;
  if (!id) {
    id = crypto.randomUUID();
    res.cookie('reai_guest', id, {
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: env.GUEST_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }
  req.guestId = id;
  next();
}

