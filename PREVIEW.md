# OPKORS — kopia testowa

Zachowano istniejący interfejs `index.html`, logikę frontendu `preview.js`,
walidację ogłoszeń, ochronę numerów telefonów, sesje i symulator zakupów.

Ta kopia ma adapter PostgreSQL dla Neon (`db/index.ts`) oraz serwer Node
(`server.mts`) do uruchomienia na Render. Funkcje API z katalogu
`netlify/functions` zostały zachowane i są wywoływane przez adapter Node;
nie przepisano logiki ogłoszeń ani zakupów od nowa.

## Ograniczenia i bezpieczeństwo

- To oddzielne środowisko testowe, nie produkcja.
- Używaj wyłącznie nowej, pustej bazy Neon. Nie łącz z bazą obecnej witryny.
- Zakupy pozostają symulacją i nie pobierają pieniędzy.
- Przed użyciem publicznym potrzebny będzie audyt, moderacja, ochrona danych,
  prawdziwy operator płatności i osobna decyzja o uruchomieniu produkcji.
- Pakiet nie został jeszcze wdrożony ani przetestowany z usługą Neon/Render.
  Wymaga ustawienia `DATABASE_URL`.

Instrukcja krok po kroku znajduje się w `URUCHOMIENIE-TESTOWE.txt`.
