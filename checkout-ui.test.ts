import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Interfejs nie zakończył oczekiwanej operacji.');
}

// HTTP fixtures test browser interactions; server security has separate tests.
async function browser(isOwner = true) {
  const dom = new JSDOM(readFileSync('index.html', 'utf8'), { url: 'https://preview.example', runScripts: 'outside-only' });
  const window = dom.window;
  let paid = false;
  let product = 'phone';
  let featured = false;
  let orderStatus = 'pending';
  const ad = { id: '11111111-1111-1111-1111-111111111111', title: 'Testowe ogłoszenie', town: 'Warszawa', category: 'Sprzątanie', description: '<script>Nie wykonuj</script>', isOwner };
  window.fetch = (async (url: string, options?: { body?: string }) => {
    const body = options?.body ? JSON.parse(options.body) : {};
    let status = 200; let result: unknown;
    if (url.endsWith('?status')) result = { preview: true, simulation: true };
    else if (url.startsWith('/api/ads?')) result = { ads: [{ ...ad, featured, featuredUntil: featured ? new Date(Date.now() + 7 * 86400000).toISOString() : null }], hasMore: false };
    else if (url.endsWith('/phone')) { status = paid ? 200 : 402; result = paid ? { phone: '000 000 000' } : { error: 'Brak dostępu' }; }
    else if (url === '/api/test-orders') { product = body.product; orderStatus = 'pending'; status = 201; result = { order: { id: 'order', product, amount: product === 'phone' ? 700 : product === 'feature7' ? 1500 : 3500, status: orderStatus } }; }
    else if (url === '/api/test-orders/order') {
      orderStatus = body.outcome === 'success' ? 'paid' : body.outcome;
      if (orderStatus === 'paid') { if (product === 'phone') paid = true; else featured = true; }
      result = { order: { id: 'order', status: orderStatus } };
    } else throw new Error('Nieoczekiwane żądanie: ' + url);
    return Response.json(result, { status });
  }) as typeof window.fetch;
  window.eval(readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1]);
  window.eval(readFileSync('preview.js', 'utf8'));
  await until(() => !!window.document.querySelector('.checkoutSummary') && window.document.querySelector('.ad h3')?.textContent === ad.title);
  return { dom, document: window.document };
}

test('checkout explains the simulator and shows phone only after success', async () => {
  const { dom, document } = await browser();
  try {
    assert.match(document.querySelector('.note')!.textContent!, /SYMULATOR PŁATNOŚCI/);
    assert.equal(document.querySelector('.ad')!.textContent!.includes('000 000 000'), false);
    assert.equal(document.querySelector('.ad script'), null);
    const contact = document.querySelector<HTMLButtonElement>('.adfoot button:last-child')!;
    contact.click();
    await until(() => document.querySelector<HTMLElement>('.modal:last-child')!.style.display === 'block');
    assert.match(document.querySelector('.checkoutSummary')!.textContent!, /7,00/);
    document.querySelector<HTMLButtonElement>('[data-outcome="success"]')!.click();
    await until(() => contact.textContent === '000 000 000');
    assert.equal(contact.disabled, true);
    assert.match(document.querySelector('.checkoutMessage')!.textContent!, /Nie pobrano pieniędzy/);
  } finally { dom.window.close(); }
});

for (const outcome of ['declined', 'cancelled']) test(`${outcome} does not reveal a phone`, async () => {
  const { dom, document } = await browser();
  try {
    document.querySelector<HTMLButtonElement>('.adfoot button:last-child')!.click();
    await until(() => document.querySelector<HTMLElement>('.modal:last-child')!.style.display === 'block');
    document.querySelector<HTMLButtonElement>(`[data-outcome="${outcome}"]`)!.click();
    await until(() => document.querySelector('.checkoutMessage')!.textContent!.includes('Nie przyznano'));
    assert.equal(document.querySelector('.ad')!.textContent!.includes('000 000 000'), false);
  } finally { dom.window.close(); }
});

for (const [days, price] of [[7, 15], [30, 35]]) test(`successful ${days}-day feature purchase refreshes the card and adds its label`, async () => {
  const { dom, document } = await browser();
  try {
    const promote = document.querySelector<HTMLButtonElement>('.owner-tools > button')!;
    assert.equal(promote.textContent, 'Wyróżnij ogłoszenie');
    assert.equal(document.querySelector<HTMLElement>('.feature-options')!.hidden, true);
    promote.click();
    assert.equal(promote.getAttribute('aria-expanded'), 'true');
    assert.equal(document.querySelector<HTMLElement>('.feature-options')!.hidden, false);
    const feature = [...document.querySelectorAll<HTMLButtonElement>('.feature-options button')].find(b => b.textContent!.includes(`${days} dni`))!;
    feature.click();
    await until(() => document.querySelector<HTMLElement>('.modal:last-child')!.style.display === 'block');
    assert.ok(document.querySelector('.checkoutSummary')!.textContent!.includes(`${price},00`));
    document.querySelector<HTMLButtonElement>('[data-outcome="success"]')!.click();
    await until(() => !!document.querySelector('.ad .tag'));
    assert.equal(document.querySelector('.ad .tag')!.textContent, '★ WYRÓŻNIENIE TESTOWE');
  } finally { dom.window.close(); }
});

test('non-owner cannot see feature controls and sees session guidance', async () => {
  const { dom, document } = await browser(false);
  try {
    assert.equal(document.querySelector('.owner-tools'), null);
    assert.match(document.querySelector('.owner-help')!.textContent!, /dokładnie ten adres podglądu/);
  } finally { dom.window.close(); }
});

test('owner can close the package selection without creating an order', async () => {
  const { dom, document } = await browser();
  try {
    const promote = document.querySelector<HTMLButtonElement>('.owner-tools > button')!;
    promote.click();
    assert.equal(document.querySelectorAll('.feature-options button').length, 2);
    promote.click();
    assert.equal(promote.getAttribute('aria-expanded'), 'false');
    assert.equal(document.querySelector<HTMLElement>('.feature-options')!.hidden, true);
    assert.equal(document.querySelector<HTMLElement>('.modal:last-child')!.style.display, '');
  } finally { dom.window.close(); }
});
