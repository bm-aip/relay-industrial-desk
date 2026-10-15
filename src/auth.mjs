import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { DomainError, requiredText } from './domain.mjs';
const derive = promisify(scrypt);
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 256) throw new DomainError('Use a password of 16–256 characters.');
  const salt = randomBytes(24).toString('hex');
  const key = await derive(password, salt, 64);
  return salt + ':' + key.toString('hex');
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, hash] = (stored || '').split(':');
  // Always derive a key, including for an unknown account.
  const key = await derive(password, salt || 'missing-account-salt', 64);
  const expected = hash ? Buffer.from(hash, 'hex') : Buffer.alloc(64);
  return expected.length === key.length && timingSafeEqual(key, expected) && !!hash;
}
export function emailAddress(value) {
  const email = requiredText(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError('Enter a valid email address.');
  return email;
}
export function safeUser(u) {
  return u ? { id: u.id, email: u.email, name: u.name, admin: u.admin, active: u.active, memberships: u.memberships } : null;
}
export function roleFor(u, customerId) {
  return u?.active ? u.admin ? 'admin' : u.memberships.find((m) => m.customerId === customerId)?.role || null : null;
}
export function requireRole(u, customerId, roles = ['admin', 'approver', 'operator', 'viewer']) {
  const role = roleFor(u, customerId);
  if (!roles.includes(role)) throw new DomainError('You do not have permission for this workspace or action.', 403);
  return role;
}
