-- OPKORS: schemat pustej bazy testowej PostgreSQL.
-- Uruchom raz w nowej, pustej bazie Neon. Nie uruchamiaj na bazie produkcyjnej.
CREATE TYPE opkors_category AS ENUM ('Sprzątanie', 'Korepetycje', 'Opieka');
CREATE TYPE product_type AS ENUM ('phone', 'feature7', 'feature30');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'declined', 'cancelled');

CREATE TABLE ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category opkors_category NOT NULL,
  town text NOT NULL,
  description text NOT NULL,
  phone text NOT NULL DEFAULT '[kontakt ukryty]',
  owner_hash text,
  featured_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ads_no_public_phone CHECK (phone = '[kontakt ukryty]')
);
CREATE INDEX ads_created_at_idx ON ads (created_at);

CREATE TABLE ad_contacts (
  ad_id uuid PRIMARY KEY REFERENCES ads(id) ON DELETE CASCADE,
  phone text NOT NULL
);

CREATE TABLE purchase_sessions (
  hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE TABLE test_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  buyer_hash text NOT NULL REFERENCES purchase_sessions(hash),
  product product_type NOT NULL,
  amount integer NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX orders_access_idx ON test_orders (buyer_hash, ad_id, status);
