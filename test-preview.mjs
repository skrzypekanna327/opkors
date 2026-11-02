import assert from 'node:assert/strict';

// Run only against an isolated preview after Netlify applies its migrations.
const target = new URL(process.argv[2] || 'https://invalid.example');
if (target.protocol !== 'https:' || !target.hostname.includes('--') || !target.hostname.endsWith('.netlify.app')) {
  throw new Error('Podaj adres HTTPS osobnego podglądu Netlify, nie produkcji.');
}
const base = target.origin;
const jar = () => ({ cookie: '' });
const seller = jar(), buyer = jar(), stranger = jar();
async function request(who, path, payload) {
  const headers = { Cookie: who.cookie, 'Cache-Control': 'no-cache' };
  if (payload !== undefined) Object.assign(headers, { Origin: base, 'Content-Type': 'application/json' });
  const response = await fetch(base + path, { method: payload === undefined ? 'GET' : 'POST', headers, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: 'error' });
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('__Host-opkors='));
  if (cookie) who.cookie = cookie.split(';')[0];
  return { status: response.status, body: await response.json() };
}
const status = await request(stranger, '/api/ads?status');
assert.equal(status.status, 200);
assert.deepEqual(status.body, { preview: true, simulation: true });

const contact = `000${String(Date.now()).slice(-6)}`;
const created = await request(seller, '/api/ads', {
  title: 'TEST — symulator zakupów OPKORS', category: 'Sprzątanie', town: 'Warszawa',
  description: 'Techniczny test ochrony telefonu i wyróżnienia. To nie jest oferta usługi.',
  phone: contact, contactConsent: true, website: '',
});
assert.equal(created.status, 201);
const adId = created.body.ad.id;
assert.equal('phone' in created.body.ad, false);
assert.equal('ownerHash' in created.body.ad, false);
assert.equal(created.body.ad.isOwner, true);
assert.equal((await request(buyer, `/api/ads/${adId}/phone`)).status, 402);

async function order(who, product) {
  const result = await request(who, '/api/test-orders', { adId, product, amount: 1 });
  assert.equal(result.status, 201);
  assert.equal(result.body.order.amount, ({ phone: 700, feature7: 1500, feature30: 3500 })[product]);
  assert.equal(result.body.order.status, 'pending');
  assert.equal(result.body.simulation, true);
  return result.body.order;
}
for (const outcome of ['declined', 'cancelled']) {
  const pending = await order(buyer, 'phone');
  const result = await request(buyer, `/api/test-orders/${pending.id}`, { outcome });
  assert.equal(result.body.order.status, outcome);
  const replay = await request(buyer, `/api/test-orders/${pending.id}`, { outcome: 'success' });
  assert.equal(replay.body.order.status, outcome);
  assert.equal((await request(buyer, `/api/ads/${adId}/phone`)).status, 402);
}
const paid = await order(buyer, 'phone');
assert.equal((await request(buyer, `/api/ads/${adId}/phone`)).status, 402);
assert.equal((await request(stranger, `/api/test-orders/${paid.id}`, { outcome: 'success' })).status, 404);
assert.equal((await request(buyer, `/api/test-orders/${paid.id}`, { outcome: 'success' })).body.order.status, 'paid');
assert.equal((await request(buyer, `/api/ads/${adId}/phone`)).body.phone, contact);
assert.equal((await request(buyer, `/api/ads/${adId}/phone`)).body.phone, contact);
assert.equal((await request(stranger, `/api/ads/${adId}/phone`)).status, 402);

const strangerOrder = await order(stranger, 'phone');
assert.equal((await request(stranger, `/api/test-orders/${paid.id}`)).status, 404);
assert.equal((await request(stranger, `/api/ads/${adId}/phone`)).status, 402);
await request(stranger, `/api/test-orders/${strangerOrder.id}`, { outcome: 'cancelled' });
assert.equal((await request(buyer, '/api/test-orders', { adId, product: 'feature7' })).status, 403);

async function readAd(who) {
  const result = await request(who, '/api/ads');
  assert.equal(result.status, 200);
  for (const ad of result.body.ads) {
    assert.equal('phone' in ad, false);
    assert.equal('ownerHash' in ad, false);
  }
  const ad = result.body.ads.find(a => a.id === adId);
  assert.ok(ad, 'Testowe ogłoszenie powinno być na pierwszej stronie.');
  return ad;
}
for (const [product, days] of [['feature7', 7], ['feature30', 30]]) {
  const before = await readAd(seller);
  const pending = await order(seller, product);
  const now = Date.now();
  assert.equal((await request(seller, `/api/test-orders/${pending.id}`, { outcome: 'success' })).body.order.status, 'paid');
  const featured = await readAd(seller);
  const expected = Math.max(now, before.featuredUntil ? new Date(before.featuredUntil).getTime() : 0) + days * 86400000;
  assert.ok(Math.abs(new Date(featured.featuredUntil).getTime() - expected) < 60000);
  assert.equal(featured.featured, true);
  await request(seller, `/api/test-orders/${pending.id}`, { outcome: 'success' });
  assert.equal((await readAd(seller)).featuredUntil, featured.featuredUntil);
}
const publicVersion = await readAd(stranger);
assert.equal(publicVersion.isOwner, false);
assert.equal(publicVersion.featured, true);
assert.equal((await request(buyer, `/api/ads/${adId}/phone`)).body.phone, contact);
console.log('OK: bezpłatny zapis, brak telefonu w publicznych odpowiedziach, ceny 7/15/35 zł, odmowa, anulowanie, izolacja kupujących, ponowny odczyt, wyróżnienia 7/30 dni i jednorazowe rozliczenie.');
console.log('Pozostawiono oznaczone ogłoszenie testowe w podglądzie. Nie pobrano pieniędzy.');
