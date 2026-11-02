Przygotowanie podglądu OPKORS
===========================

Zachowano dotychczasowy wygląd i trzy kategorie. Formularz prawdziwych ogłoszeń
uaktywnia się wyłącznie po potwierdzeniu kontekstu deploy-preview lub lokalnego
dev przez funkcję Netlify. Każdy wpis testowy jest od razu widoczny w podglądzie,
również dla innych osób z linkiem. Należy używać fikcyjnych danych kontaktowych.
Nie dodano kont ogłoszeniodawców ani moderacji. Zakupy są wyraźnie oznaczonym
symulatorem, bez operatora i bez pobierania pieniędzy.

Nie wolno publikować tego etapu na produkcji bez zgody właścicielki. Skrypt
przygotowujący pliki przerywa wdrożenie w kontekście production. API odrzuca
żądania produkcyjne i opublikowane wdrożenia przed otwarciem połączenia z bazą.
Udostępniany katalog public zawiera tylko index.html oraz preview.js.

Model bazy zapisano w db/schema.ts. Migrację wygenerowano w katalogu
netlify/database/migrations. Netlify stosuje migracje automatycznie przy
wdrożeniu podglądu do oddzielnej gałęzi bazy. Nie należy wykonywać migracji
ręcznie, w tym poleceń drizzle-kit push ani drizzle-kit migrate.

Kontrole lokalne: npm run check oraz npm test. Po automatycznym przygotowaniu
Deploy Preview należy sprawdzić zapis i odczyt w prawdziwej bazie: dodać testowy
wpis w każdej kategorii, odświeżyć stronę, otworzyć link w drugiej przeglądarce,
sprawdzić wyszukiwanie i odsłonięcie telefonu. Powtórne dodanie z tym samym
numerem przed upływem minuty powinno zostać odrzucone. Wpisy z podglądu nie
powinny pojawić się na produkcji.

Symulator zakupów
----------------

Dodawanie ogłoszeń pozostaje bezpłatne. Ceny ustala wyłącznie serwer:
telefon 7 zł, wyróżnienie na 7 dni 15 zł i na 30 dni 35 zł. Okno testu pozwala
wybrać sukces, odmowę lub anulowanie. Nie ma pól karty i połączeń z operatorem.
Odmowa i anulowanie są ostateczne; nowa próba tworzy nowe zamówienie.
Powtórne potwierdzenie opłaconego zamówienia nie przedłuża wyróżnienia.
Nowy zakup wyróżnienia dodaje 7 albo 30 dni od późniejszej z dat: teraz lub
dotychczasowy koniec wyróżnienia. Wygasłe wyróżnienia nie są promowane.

Anonimowa sesja zakupu jest przechowywana w HttpOnly/Secure/SameSite=Strict
cookie tylko dla danego adresu podglądu. W bazie zapisywany jest jej skrót
i termin ważności, bez surowej wartości cookie. Sesja ma ważność 30 dni od
utworzenia; w tej sesji można ponownie odczytać zakupiony kontakt bez nowego
zakupu. Wyczyszczenie cookies, zmiana adresu podglądu lub inna przeglądarka nie
przenoszą zakupów ani prawa wyróżniania ogłoszeń. To ograniczenie testu,
a nie gotowy system kont i odzyskiwania zakupów dla produkcji.

Nowo dodane ogłoszenia są przypisywane do sesji twórcy; tylko ona może kupić
wyróżnienie. Starsze wpisy nie otrzymują domyślnie nowego właściciela. Do testu
wyróżnień należy dodać nowe ogłoszenie w tej samej przeglądarce.

Telefony trafiają do oddzielnej tabeli ad_contacts. Migracja danych przenosi
istniejące kontakty i zastępuje dawne ads.phone stałym placeholderem. Kolejna
migracja wymusza placeholder ograniczeniem bazy, więc starsze podglądy ze
wspólną gałęzią bazy nie mogą odczytać rzeczywistych numerów ani zapisać ich
z powrotem do starego pola. Ich stary formularz może przestać działać — należy
używać aktualnego podglądu. Zmiana nie cofa wcześniejszego pobrania numerów.
Nie wpisuj numeru telefonu w publiczny tytuł lub opis ogłoszenia.

Publiczne odpowiedzi listy i dodawania nie zawierają numeru ani skrótu sesji.
Oddzielny endpoint telefonu weryfikuje ważną sesję i opłacony zakup tego
konkretnego ogłoszenia. Odpowiedzi mają no-store i Vary: Cookie.
Symulator i wszystkie nowe API są blokowane poza deploy-preview/dev oraz
w każdym opublikowanym wdrożeniu. Nie wolno usuwać tych blokad do produkcji
bez zastąpienia symulatora prawdziwą weryfikacją płatności.

Test integracyjny po automatycznym wdrożeniu i zastosowaniu migracji:

    npm run test:preview -- https://ADRES-PODGLADU--NAZWA.netlify.app

Skrypt przed zapisaniem czegokolwiek wymaga adresu podglądu i potwierdzenia
simulation=true. Sprawdza zapis ogłoszenia bez telefonu w odpowiedzi,
odmowę dostępu przed zakupem, cenę odporną na zmianę przez klienta, odmowę,
anulowanie, izolację sesji, ponowny odczyt zakupionego kontaktu, oba okresy
wyróżnienia i odporność na ponowne potwierdzenie. Pozostawia oznaczony wpis
testowy. Lokalny npm test sprawdza też interfejs w DOM z testowymi odpowiedziami
HTTP; nie zastępuje to powyższego testu wdrożonej bazy.

Weryfikacja konta przez Netlify API wykazała plan Free (credit-free),
300 kredytów w limicie miesięcznym, wyłączone rozliczanie nadwyżek i blokadę
budowania po przekroczeniu limitu. Publiczny cennik Netlify potwierdził
dostępność Netlify Database w Free oraz twardy limit bez opłat za przekroczenie.
API konta nie zwróciło osobnego przełącznika automatycznego doładowania.
Nie włączono żadnego doładowania, nie kupiono dodatków i nie zmieniono planu.
Wykorzystanie podglądu i bazy zużywa wspólny limit zespołu; po wyczerpaniu
limitu mogą zostać wstrzymane także inne witryny na koncie.

Źródło zasad rozliczeń: https://www.netlify.com/pricing/


## Zachowanie przy niedostępnym API (poprawka)

Skrypt podglądu najpierw sprawdza endpoint `/api/ads?status`. Jeśli serwer nie odpowiada, zwraca błąd albo adres nie jest odizolowanym wdrożeniem podglądowym, interfejs wyłącza dodawanie ogłoszeń i usuwa przykładowe karty. Zamiast pozornej wersji demonstracyjnej pokazuje czytelny komunikat. Dzięki temu brak połączenia z funkcjami Netlify nie jest mylony z działającym portalem.
