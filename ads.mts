import type { Config, Context } from '@netlify/functions';
import { desc, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { ads, adContacts } from '../../db/schema.js';
import { previewAllowed, validateAd } from '../../lib/ads.js';
import { json, getSession, publicAd, readJson, HttpError } from '../../lib/commerce.js';

export default async (req: Request, context: Context) => {
  // Never connect to a database from production or a published deployment.
  if (!previewAllowed(context.deploy.context) || context.deploy.published) return json({ error: 'Ogłoszenia są dostępne wyłącznie w podglądzie.' }, 403);
  if (req.method !== 'GET' && req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  if (req.method === 'GET' && new URL(req.url).searchParams.has('status')) return json({ preview: true, simulation: true });
  try {
    if (req.method === 'GET') {
      const offset = Number(new URL(req.url).searchParams.get('offset') || 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) return json({ error: 'Nieprawidłowa strona.' }, 400);
      const session = await getSession(req);
      const records = await getDb().select().from(ads).orderBy(desc(sql`coalesce(${ads.featuredUntil} > now(), false)`), desc(ads.createdAt), desc(ads.id)).limit(21).offset(offset);
      return json({ ads: records.slice(0, 20).map(ad => publicAd(ad, session?.hash)), hasMore: records.length > 20 });
    }
    const input = await readJson(req);
    let values;
    try { values = validateAd(input); }
    catch (error) { return json({ error: error instanceof SyntaxError ? 'Nieprawidłowy formularz.' : (error as Error).message }, 400); }
    const db = getDb();
    const session = (await getSession(req, true))!;
    // Transaction lock prevents simultaneous submissions bypassing the phone cooldown.
    const inserted = await db.transaction(async (tx) => {
      const phone = values.phone.replace(/\D/g, '');
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${phone}))`);
      const recent = await tx.select({ id: ads.id }).from(ads).innerJoin(adContacts, sql`${ads.id} = ${adContacts.adId}`).where(sql`regexp_replace(${adContacts.phone}, '[^0-9]', '', 'g') = ${phone} and ${ads.createdAt} > now() - interval '1 minute'`).limit(1);
      if (recent.length) return null;
      const { phone: contactPhone, ...publicValues } = values;
      const [ad] = await tx.insert(ads).values({ ...publicValues, ownerHash: session.hash }).returning();
      await tx.insert(adContacts).values({ adId: ad.id, phone: contactPhone });
      return ad;
    });
    if (!inserted) return json({ error: 'Odczekaj minutę przed dodaniem kolejnego ogłoszenia z tym numerem.' }, 429);
    return json({ ad: publicAd(inserted, session.hash) }, 201, session.cookie);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: 'Baza jest chwilowo niedostępna. Spróbuj ponownie później.' }, 503);
  }
};

export const config: Config = {
  path: '/api/ads',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
