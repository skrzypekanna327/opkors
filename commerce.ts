import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { purchaseSessions } from '../db/schema.js';

export function productDetails(product: unknown) {
  switch (product) {
    case 'phone': return { product, amount: 700, days: 0, label: 'Odblokowanie telefonu' } as const;
    case 'feature7': return { product, amount: 1500, days: 7, label: 'Wyróżnienie na 7 dni' } as const;
    case 'feature30': return { product, amount: 3500, days: 30, label: 'Wyróżnienie na 30 dni' } as const;
    default: throw new HttpError(400, 'Nieznany produkt.');
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, status = 200, cookie?: string) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store, private', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return Response.json(body, { status, headers });
}

export function sessionDigest(req: Request) {
  const value = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('__Host-opkors='))?.slice('__Host-opkors='.length);
  return value && /^[a-f0-9]{64}$/.test(value) ? createHash('sha256').update(value).digest('hex') : null;
}

export async function getSession(req: Request, create = false) {
  const hash = sessionDigest(req);
  if (!hash && !create) return null;
  const db = getDb();
  if (hash) {
    const [existing] = await db.select({ hash: purchaseSessions.hash }).from(purchaseSessions).where(and(eq(purchaseSessions.hash, hash), gt(purchaseSessions.expiresAt, new Date()))).limit(1);
    if (existing) return { hash: existing.hash, cookie: undefined };
  }
  if (!create) return null;
  const value = randomBytes(32).toString('hex');
  const newHash = createHash('sha256').update(value).digest('hex');
  await db.insert(purchaseSessions).values({ hash: newHash, expiresAt: new Date(Date.now() + 30 * 86400000) });
  return { hash: newHash, cookie: `__Host-opkors=${value}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict` };
}

export async function readJson(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) throw new HttpError(403, 'Niedozwolone źródło formularza.');
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Wymagany formularz JSON.');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'Brak formularza.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new HttpError(413, 'Formularz jest zbyt duży.'); }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new HttpError(400, 'Nieprawidłowy formularz.'); }
}

export function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
}

// Explicit allowlist: never serialize a whole database ad to a public response.
export function publicAd(ad: {
  id: string; title: string; category: string; town: string; description: string;
  createdAt: Date; featuredUntil: Date | null; ownerHash?: string | null;
}, buyerHash?: string | null) {
  return {
    id: ad.id, title: ad.title, category: ad.category, town: ad.town,
    description: ad.description, createdAt: ad.createdAt,
    featuredUntil: ad.featuredUntil,
    featured: !!ad.featuredUntil && ad.featuredUntil.getTime() > Date.now(),
    isOwner: !!buyerHash && ad.ownerHash === buyerHash,
  };
}

export function nextOrderStatus(status: string, outcome: unknown) {
  if (outcome !== 'success' && outcome !== 'declined' && outcome !== 'cancelled') throw new HttpError(400, 'Wybierz wynik symulacji.');
  if (status !== 'pending') return status;
  return outcome === 'success' ? 'paid' : outcome;
}
