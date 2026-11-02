import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAd, previewAllowed } from '../lib/ads.js';
import handler from '../netlify/functions/ads.mjs';
import type { Context } from '@netlify/functions';

const valid = { title: 'Sprzątanie domu', town: 'Warszawa', description: 'Testowe ogłoszenie usługi', phone: '555 123 456', category: 'Sprzątanie', contactConsent: true };
test('production and ordinary branch deploys cannot access the preview API', () => {
  assert.equal(previewAllowed('production'), false);
  assert.equal(previewAllowed('branch-deploy'), false);
  assert.equal(previewAllowed('deploy-preview'), true);
  assert.equal(previewAllowed('dev'), true);
});
test('all three categories are accepted; unknown categories are rejected', () => {
  for (const category of ['Sprzątanie', 'Korepetycje', 'Opieka']) assert.equal(validateAd({ ...valid, category }).category, category);
  assert.throws(() => validateAd({ ...valid, category: 'Inna' }));
});
test('invalid contacts, missing consent, bots and oversized content are rejected', () => {
  for (const input of [null, [], { ...valid, phone: 'abc' }, { ...valid, contactConsent: false }, { ...valid, website: 'spam' }, { ...valid, description: 'a'.repeat(3001) }]) assert.throws(() => validateAd(input));
});
test('required text is trimmed without interpreting HTML', () => {
  assert.equal(validateAd({ ...valid, title: '  <b>Test</b>  ' }).title, '<b>Test</b>');
});

test('production requests are denied before any database connection', async () => {
  for (const method of ['GET', 'POST']) {
    const response = await handler(new Request('https://opkors.example/api/ads', { method }), { deploy: { context: 'production', published: true } } as Context);
    assert.equal(response.status, 403);
  }
});

test('published deployments cannot access preview data even with a preview context', async () => {
  const response = await handler(new Request('https://opkors.example/api/ads'), { deploy: { context: 'deploy-preview', published: true } } as Context);
  assert.equal(response.status, 403);
});

test('preview status and cross-origin rejection need no database connection', async () => {
  const context = { deploy: { context: 'deploy-preview', published: false } } as Context;
  const status = await handler(new Request('https://preview.example/api/ads?status'), context);
  assert.deepEqual(await status.json(), { preview: true, simulation: true });
  const rejected = await handler(new Request('https://preview.example/api/ads', { method: 'POST', headers: { Origin: 'https://other.example' } }), context);
  assert.equal(rejected.status, 403);
});

test('oversized streamed forms are rejected without writing to the database', async () => {
  const context = { deploy: { context: 'deploy-preview', published: false } } as Context;
  const response = await handler(new Request('https://preview.example/api/ads', {
    method: 'POST', headers: { Origin: 'https://preview.example', 'Content-Type': 'application/json' }, body: 'a'.repeat(17000),
  }), context);
  assert.equal(response.status, 413);
});
