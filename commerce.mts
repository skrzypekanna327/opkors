import type { Config, Context } from '@netlify/functions';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { ads, orders, adContacts } from '../../db/schema.js';
import { previewAllowed } from '../../lib/ads.js';
import { getSession, json, readJson, uuid, productDetails, nextOrderStatus, HttpError } from '../../lib/commerce.js';

export default async (req: Request, context: Context) => {
  if (!previewAllowed(context.deploy.context) || context.deploy.published) return json({ error: 'Symulator jest dostępny tylko w podglądzie.' }, 403);
  if (req.method !== 'GET' && req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  try {
    const path = new URL(req.url).pathname;
    const phoneMatch = path.match(/^\/api\/ads\/([^/]+)\/phone$/);
    if (phoneMatch) {
      if (req.method !== 'GET') return json({ error: 'Niedozwolona metoda.' }, 405);
      const adId = phoneMatch[1];
      if (!uuid(adId)) return json({ error: 'Nieprawidłowe ogłoszenie.' }, 400);
      const session = await getSession(req);
      if (!session) return json({ error: 'Najpierw odblokuj telefon za 7 zł w symulatorze.' }, 402);
      const [grant] = await getDb().select({ phone: adContacts.phone }).from(orders).innerJoin(adContacts, eq(adContacts.adId, orders.adId)).where(and(eq(orders.adId, adId), eq(orders.buyerHash, session.hash), eq(orders.product, 'phone'), eq(orders.status, 'paid'))).limit(1);
      if (!grant) return json({ error: 'Brak opłaconego dostępu do tego telefonu.' }, 402);
      return json({ phone: grant.phone, simulation: true });
    }
    const match = path.match(/^\/api\/test-orders(?:\/([^/]+))?$/);
    if (!match) return json({ error: 'Nie znaleziono.' }, 404);
    const orderId = match[1];
    if (orderId && !uuid(orderId)) return json({ error: 'Nieprawidłowe zamówienie.' }, 400);
    const body = req.method === 'POST' ? await readJson(req) : null;
    if (!orderId) {
      if (!body) return json({ error: 'Niedozwolona metoda.' }, 405);
      if (!uuid(body.adId)) return json({ error: 'Wybierz ogłoszenie.' }, 400);
      const details = productDetails(body.product);
      const db = getDb();
      const [ad] = await db.select({ id: ads.id, ownerHash: ads.ownerHash }).from(ads).where(eq(ads.id, body.adId)).limit(1);
      if (!ad) return json({ error: 'Ogłoszenie nie istnieje.' }, 404);
      const session = await getSession(req, !details.days);
      if (!session || (details.days && ad.ownerHash !== session.hash)) return json({ error: 'Wyróżnić możesz wyłącznie ogłoszenie dodane w tej przeglądarce. Starsze wpisy nie mają przypisanego właściciela.' }, 403);
      const [order] = await db.insert(orders).values({ adId: ad.id, buyerHash: session.hash, product: details.product, amount: details.amount }).returning({ id: orders.id, product: orders.product, amount: orders.amount, status: orders.status });
      return json({ order, currency: 'PLN', simulation: true }, 201, session.cookie);
    }
    const session = await getSession(req);
    if (!session) return json({ error: 'Zamówienie niedostępne w tej przeglądarce.' }, 404);
    const result = await getDb().transaction(async tx => {
      // Serialize completion: repeated or concurrent confirmations apply an effect once.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orderId}))`);
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerHash, session.hash))).limit(1);
      if (!order) throw new HttpError(404, 'Nie znaleziono zamówienia.');
      if (body) {
        const next = nextOrderStatus(order.status, body.outcome) as typeof order.status;
        if (order.status === 'pending') {
          const details = productDetails(order.product);
          if (next === 'paid' && details.days) {
            // Database clock and atomic update also handle simultaneous different orders.
            const updated = await tx.update(ads).set({ featuredUntil: sql`greatest(coalesce(${ads.featuredUntil}, now()), now()) + ${details.days} * interval '1 day'` }).where(and(eq(ads.id, order.adId), eq(ads.ownerHash, session.hash))).returning({ id: ads.id });
            if (!updated.length) throw new HttpError(403, 'Nie możesz wyróżnić tego ogłoszenia.');
          }
          await tx.update(orders).set({ status: next, completedAt: new Date() }).where(eq(orders.id, order.id));
          order.status = next;
        }
      }
      return { id: order.id, adId: order.adId, product: order.product, amount: order.amount, status: order.status };
    });
    return json({ order: result, currency: 'PLN', simulation: true });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: 'Symulator jest chwilowo niedostępny. Spróbuj ponownie.' }, 503);
  }
};

export const config: Config = {
  path: ['/api/test-orders', '/api/test-orders/:id', '/api/ads/:id/phone'],
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
