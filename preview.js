// Enable real submissions only after the server confirms an isolated preview.
// Fail closed: never leave the old local demo active when the API is unavailable.
(async () => {
  const grid = document.querySelector('.formgrid');
  const submit = grid?.querySelector('button');
  const notice = document.querySelector('.dialog > p');
  const note = document.querySelector('.note');
  const container = document.getElementById('ads');
  const listingTitle = document.getElementById('listingTitle');
  const navAdd = document.querySelector('.nav button.primary');

  // Remove static sample cards immediately so they cannot be mistaken for live ads.
  container.replaceChildren();
  listingTitle.textContent = 'Sprawdzanie podglądu testowego…';
  if (submit) { submit.removeAttribute('onclick'); submit.disabled = true; submit.textContent = 'Sprawdzanie…'; }
  if (navAdd) navAdd.disabled = true;

  function showUnavailable(message) {
    listingTitle.textContent = 'Podgląd testowy niedostępny';
    container.replaceChildren();
    const error = document.createElement('p');
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');
    error.textContent = message;
    container.append(error);
    if (notice) notice.textContent = message;
    if (note) note.textContent = 'Tryb demonstracyjny został wyłączony, aby nie pokazywać fikcyjnych ogłoszeń ani nie udawać zapisu danych. Spróbuj ponownie później lub skontaktuj się z administratorem wdrożenia.';
    if (submit) { submit.disabled = true; submit.textContent = 'Dodawanie chwilowo niedostępne'; }
    if (navAdd) { navAdd.disabled = true; navAdd.removeAttribute('onclick'); }
  }

  let status;
  try { status = await fetch('/api/ads?status', { cache: 'no-store' }); }
  catch {
    showUnavailable('Nie udało się połączyć z serwerem podglądu. Ogłoszenia i zakupy testowe są tymczasowo wyłączone.');
    return;
  }
  if (!status.ok) {
    showUnavailable(`Serwer podglądu zwrócił błąd (${status.status}). Ogłoszenia i zakupy testowe są wyłączone.`);
    return;
  }
  const info = await status.json().catch(() => null);
  if (!info || info.preview !== true) {
    showUnavailable('Ten adres nie jest aktywnym podglądem testowym. Nie można dodawać ogłoszeń ani wykonywać zakupów testowych.');
    return;
  }

  notice.textContent = 'Podgląd testowy: ogłoszenia są zapisywane w osobnej bazie i widoczne dla osób z linkiem do podglądu. Używaj danych testowych.';
  note.textContent = 'SYMULATOR PŁATNOŚCI — nie pobieramy pieniędzy ani danych karty. Dodawanie ogłoszeń: bezpłatne. Telefon: 7 zł. Wyróżnienie: 7 dni / 15 zł lub 30 dni / 35 zł. Zakupy testowe i własne ogłoszenia są rozpoznawane w tej przeglądarce przez 30 dni od utworzenia sesji; wyczyszczenie cookies usuwa dostęp. Wyróżnisz nowe ogłoszenie dodane w tej przeglądarce. Używaj danych testowych. Wyszukiwanie obejmuje wczytaną część listy.';
  document.querySelector('.hero .wrap').append(note);
  const labels = { title: 'Tytuł ogłoszenia', category: 'Kategoria', town: 'Miejscowość', description: 'Opis usługi' };
  for (const [id, text] of Object.entries(labels)) {
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = text;
    document.getElementById(id).before(label);
  }
  const phoneLabel = document.createElement('label');
  phoneLabel.htmlFor = 'phone';
  phoneLabel.textContent = 'Telefon kontaktowy';
  const phone = document.createElement('input');
  phone.id = 'phone'; phone.type = 'tel'; phone.maxLength = 24;
  phone.placeholder = 'Numer telefonu';
  const consent = document.createElement('input');
  consent.type = 'checkbox'; consent.style.width = 'auto';
  const consentLabel = document.createElement('label');
  consentLabel.append(consent, ' Zgadzam się na udostępnienie telefonu osobom, które odblokują kontakt w symulatorze w podglądzie.');
  const trap = document.createElement('input');
  trap.name = 'website'; trap.hidden = true; trap.tabIndex = -1; trap.autocomplete = 'off';
  const message = document.createElement('p');
  message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  grid.insertBefore(phoneLabel, submit);
  grid.insertBefore(phone, submit);
  grid.insertBefore(consentLabel, submit);
  grid.insertBefore(trap, submit);
  grid.append(message);
  submit.removeAttribute('onclick');
  submit.textContent = 'Dodaj bezpłatne ogłoszenie';
  container.replaceChildren();
  listingTitle.textContent = 'Ogłoszenia w podglądzie';
  const ownerHelp = document.createElement('p'); ownerHelp.className = 'owner-help';
  ownerHelp.textContent = 'Przycisk „Wyróżnij ogłoszenie” znajdziesz przy wpisach oznaczonych „Twoje ogłoszenie”. Jeśli go nie widzisz, otwórz dokładnie ten adres podglądu i tę przeglądarkę, w których dodano wpis. Starsze ogłoszenia bez przypisanego właściciela nie mają tej opcji — do testu dodaj nowe ogłoszenie.';
  container.before(ownerHelp);
  let offset = 0;
  const more = document.createElement('button');
  more.className = 'outline'; more.textContent = 'Wczytaj więcej'; more.hidden = true;
  const listMessage = document.createElement('p'); listMessage.setAttribute('role', 'status');
  container.after(listMessage, more);

  async function api(path, payload) {
    const response = await fetch(path, payload === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) { const error = new Error(body.error || 'Operacja nie powiodła się.'); error.status = response.status; throw error; }
    return body;
  }

  const checkout = document.createElement('div'); checkout.className = 'modal';
  checkout.innerHTML = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle"><button type="button" class="close">Zamknij ✕</button><h2 id="checkoutTitle">Symulator płatności</h2><p class="meta">TEST — bez pobierania pieniędzy. Nie podawaj danych karty.</p><p class="checkoutSummary"></p><p>Wybierz wynik testowej transakcji:</p><div class="formgrid"><button type="button" class="primary" data-outcome="success">Symuluj udaną płatność</button><button type="button" class="outline" data-outcome="declined">Symuluj odmowę</button><button type="button" class="outline" data-outcome="cancelled">Anuluj transakcję testową</button></div><p role="status" aria-live="polite" class="checkoutMessage"></p></div>';
  document.body.append(checkout);
  let currentOrder = null, afterPurchase = null, opener = null, busy = false;
  function closeCheckout() { if (busy) return; checkout.style.display = 'none'; opener?.focus(); }
  checkout.querySelector('.close').addEventListener('click', closeCheckout);
  checkout.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeCheckout();
    if (event.key === 'Tab') {
      const buttons = [...checkout.querySelectorAll('button:not(:disabled)')];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    }
  });
  checkout.querySelectorAll('[data-outcome]').forEach(button => button.addEventListener('click', async () => {
    if (!currentOrder || busy) return;
    busy = true;
    checkout.querySelectorAll('button').forEach(b => b.disabled = true);
    const output = checkout.querySelector('.checkoutMessage'); output.textContent = 'Zapisywanie wyniku testu…';
    try {
      const result = await api(`/api/test-orders/${currentOrder.id}`, { outcome: button.dataset.outcome });
      currentOrder = result.order;
      if (currentOrder.status === 'paid') {
        output.textContent = 'Testowa płatność udana. Nie pobrano pieniędzy.';
        await afterPurchase();
      } else output.textContent = 'Transakcja nie została opłacona. Nie przyznano dostępu ani wyróżnienia.';
      checkout.querySelectorAll('[data-outcome]').forEach(b => b.hidden = true);
    } catch (error) { output.textContent = error.message; }
    finally { busy = false; checkout.querySelectorAll('button').forEach(b => b.disabled = false); checkout.querySelector('.close').focus(); }
  }));

  async function buy(ad, product, source, done) {
    source.disabled = true;
    try {
      const result = await api('/api/test-orders', { adId: ad.id, product });
      currentOrder = result.order; afterPurchase = done; opener = source;
      const labels = { phone: 'Odblokowanie telefonu', feature7: 'Wyróżnienie na 7 dni', feature30: 'Wyróżnienie na 30 dni' };
      checkout.querySelector('.checkoutSummary').textContent = `${ad.title} — ${labels[product]}: ${(currentOrder.amount / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })} (kwota symulowana).`;
      checkout.querySelector('.checkoutMessage').textContent = '';
      checkout.querySelectorAll('[data-outcome]').forEach(b => b.hidden = false);
      checkout.style.display = 'block'; checkout.querySelector('.close').focus();
    } catch (error) { listMessage.textContent = error.message; }
    finally { source.disabled = false; }
  }

  function card(ad) {
    const article = document.createElement('article'); article.className = 'ad';
    article.dataset.cat = ad.category; article.dataset.city = ad.town;
    const title = document.createElement('h3'); title.textContent = ad.title;
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${ad.category} • ${ad.town}`;
    const description = document.createElement('p'); description.className = 'desc'; description.textContent = ad.description;
    const foot = document.createElement('div'); foot.className = 'adfoot';
    const contact = document.createElement('button'); contact.className = 'outline'; contact.textContent = 'Pokaż telefon / odblokuj za 7 zł';
    async function revealPhone() {
      const result = await api(`/api/ads/${ad.id}/phone`);
      contact.textContent = result.phone; contact.disabled = true;
    }
    contact.addEventListener('click', async () => {
      contact.disabled = true;
      try { await revealPhone(); }
      catch (error) {
        contact.disabled = false;
        if (error.status === 402) await buy(ad, 'phone', contact, revealPhone);
        else listMessage.textContent = error.message;
      }
    });
    if (ad.featured) {
      const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = '★ WYRÓŻNIENIE TESTOWE'; article.append(tag);
      const expiry = document.createElement('small'); expiry.textContent = `Wyróżnienie do ${new Date(ad.featuredUntil).toLocaleString('pl-PL')}`; article.append(expiry);
    }
    const ownerTools = document.createElement('div');
    if (ad.isOwner) {
      ownerTools.className = 'owner-tools';
      const ownerLabel = document.createElement('strong'); ownerLabel.textContent = 'Twoje ogłoszenie';
      const promote = document.createElement('button'); promote.type = 'button'; promote.className = 'primary'; promote.textContent = 'Wyróżnij ogłoszenie';
      const options = document.createElement('div'); options.className = 'feature-options'; options.id = `feature-options-${ad.id}`; options.hidden = true;
      promote.setAttribute('aria-expanded', 'false'); promote.setAttribute('aria-controls', options.id);
      promote.addEventListener('click', () => {
        options.hidden = !options.hidden;
        promote.setAttribute('aria-expanded', String(!options.hidden));
      });
      const hint = document.createElement('small'); hint.textContent = 'Symulator — bez pobierania pieniędzy.';
      for (const [product, label] of [['feature7', 'Wyróżnij 7 dni — 15 zł'], ['feature30', 'Wyróżnij 30 dni — 35 zł']]) {
        const feature = document.createElement('button'); feature.type = 'button'; feature.className = 'outline'; feature.textContent = label;
        feature.addEventListener('click', () => buy(ad, product, feature, () => load(true))); options.append(feature);
      }
      ownerTools.append(ownerLabel, promote, options, hint);
    }
    foot.append(contact); article.append(title, meta, description, foot);
    if (ad.isOwner) article.append(ownerTools);
    return article;
  }
  async function load(reset = false) {
    more.disabled = true; listMessage.textContent = 'Wczytywanie ogłoszeń…';
    try {
      const response = await fetch(`/api/ads?offset=${reset ? 0 : offset}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Nie udało się pobrać ogłoszeń.');
      if (reset) { container.replaceChildren(); offset = 0; }
      for (const ad of body.ads) container.append(card(ad));
      offset += body.ads.length; more.hidden = !body.hasMore;
      listMessage.textContent = offset ? '' : 'Nie ma jeszcze ogłoszeń. Dodaj pierwsze ogłoszenie testowe.';
      if (document.getElementById('q').value || document.getElementById('city').value) searchAds();
    } catch (error) {
      more.hidden = true;
      showUnavailable(`Nie można wczytać ogłoszeń z bazy podglądu: ${error.message} Dodawanie ogłoszeń i zakupy testowe zostały wyłączone.`);
    }
    finally { more.disabled = false; }
  }
  more.addEventListener('click', () => load());
  submit.addEventListener('click', async () => {
    submit.disabled = true; message.textContent = 'Zapisywanie…';
    const payload = Object.fromEntries(['title', 'category', 'town', 'description'].map(id => [id, document.getElementById(id).value]));
    Object.assign(payload, { phone: phone.value, contactConsent: consent.checked, website: trap.value });
    try {
      const response = await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Nie udało się zapisać ogłoszenia.');
      message.textContent = 'Ogłoszenie zapisane w bazie podglądu. Jest dostępne również po odświeżeniu strony.';
      for (const id of ['title', 'town', 'description']) document.getElementById(id).value = '';
      phone.value = ''; consent.checked = false;
      await load(true);
    } catch (error) { message.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  if (submit) { submit.disabled = false; submit.textContent = 'Dodaj bezpłatne ogłoszenie'; }
  if (navAdd) navAdd.disabled = false;
  await load();
})();
