import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@netlify/functions';
import handler from '../netlify/functions/commerce.mjs';
import { productDetails, nextOrderStatus, publicAd, json, sessionDigest } from '../lib/commerce.js';

test('only the approved products and integer PLN amounts are available', () => {
  assert.deepEqual(['phone', 'feature7', 'feature30'].map(p => productDetails(p).amount), [700, 1500, 3500]);
  assert.deepEqual(['feature7', 'feature30'].map(p => productDetails(p).days), [7, 30]);
  for (const p of ['free', 'phone?amount=1', {}, null]) assert.throws(() => productDetails(p));
});

test('failure and cancellation cannot be changed to paid; success is idempotent', () => {
  assert.equal(nextOrderStatus('pending', 'success'), 'paid');
  assert.equal(nextOrderStatus('pending', 'declined'), 'declined');
  assert.equal(nextOrderStatus('pending', 'cancelled'), 'cancelled');
  for (const status of ['paid', 'declined', 'cancelled']) {
    for (const outcome of ['success', 'declined', 'cancelled']) assert.equal(nextOrderStatus(status, outcome), status);
  }
  assert.throws(() => nextOrderStatus('pending', 'paid'));
});

test('public responses exclude contact and ownership material even for the owner', () => {
  const privateAd = { id: 'test', title: 'Test', category: 'Opieka', town: 'Łódź', description: 'Opis', createdAt: new Date(), featuredUntil: null, ownerHash: 'private-owner', phone: '000000000' };
  for (const session of [null, 'someone-else', 'private-owner']) {
    const result = publicAd(privateAd, session);
    assert.equal('phone' in result, false);
    assert.equal('ownerHash' in result, false);
    assert.equal(result.isOwner, session === 'private-owner');
    assert.equal(result.featured, false);
  }
  assert.equal(publicAd({ ...privateAd, featuredUntil: new Date(Date.now() - 1000) }).featured, false);
  assert.equal(publicAd({ ...privateAd, featuredUntil: new Date(Date.now() + 10000) }).featured, true);
});

test('private data is never cacheable across visitors', () => {
  const response = json({ phone: '000000000' });
  assert.match(response.headers.get('cache-control')!, /no-store/);
  assert.equal(response.headers.get('vary'), 'Cookie');
});

test('missing and malformed purchase sessions have no identity', () => {
  for (const value of ['', '__Host-opkors=123', 'other=abc']) {
    assert.equal(sessionDigest(new Request('https://preview.example', { headers: { Cookie: value } })), null);
  }
});

test('all commerce routes are denied on production and published deployments', async () => {
  for (const deploy of [{ context: 'production', published: true }, { context: 'deploy-preview', published: true }, { context: 'branch-deploy', published: false }]) {
    for (const path of ['/api/test-orders', '/api/ads/00000000-0000-0000-0000-000000000000/phone']) {
      assert.equal((await handler(new Request('https://preview.example' + path), { deploy } as Context)).status, 403);
    }
  }
});

test('unpaid visitor cannot access a phone or another visitors order', async () => {
  const context = { deploy: { context: 'deploy-preview', published: false } } as Context;
  const phone = await handler(new Request('https://preview.example/api/ads/00000000-0000-0000-0000-000000000000/phone'), context);
  assert.equal(phone.status, 402);
  assert.equal('phone' in await phone.json(), false);
  const order = await handler(new Request('https://preview.example/api/test-orders/00000000-0000-0000-0000-000000000000'), context);
  assert.equal(order.status, 404);
});

test('cross-origin order creation is rejected before accessing data', async () => {
  const context = { deploy: { context: 'deploy-preview', published: false } } as Context;
  const request = new Request('https://preview.example/api/test-orders', { method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await handler(request, context)).status, 403);
});
