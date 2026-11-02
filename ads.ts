export function previewAllowed(context: string) {
  return context === 'deploy-preview' || context === 'dev';
}

export function validateAd(input: unknown): {
  title: string; town: string; description: string; phone: string;
  category: 'Sprzątanie' | 'Korepetycje' | 'Opieka';
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Nieprawidłowy formularz.');
  const data = input as Record<string, unknown>;
  if (data.website) throw new Error('Nieprawidłowy formularz.');
  const field = (key: string, min: number, max: number) => {
    const value = data[key];
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
      throw new Error(`Sprawdź pole: ${key} (od ${min} do ${max} znaków).`);
    }
    return value.trim();
  };
  const title = field('title', 3, 120);
  const town = field('town', 2, 100);
  const description = field('description', 10, 3000);
  const phone = field('phone', 9, 24);
  if (!/^[+\d ()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 9 || phone.replace(/\D/g, '').length > 15) {
    throw new Error('Podaj poprawny numer telefonu.');
  }
  const category = data.category;
  if (category !== 'Sprzątanie' && category !== 'Korepetycje' && category !== 'Opieka') throw new Error('Wybierz jedną z trzech kategorii.');
  if (data.contactConsent !== true) throw new Error('Potwierdź zgodę na pokazanie telefonu.');
  return { title, town, description, phone, category };
}
