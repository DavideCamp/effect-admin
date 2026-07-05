-- Volume seed (roadmap F2: "seed di volume per provarlo davvero").
-- Deterministic pseudo-variety via modular arithmetic — no random(), so
-- every fresh container has identical data and tests can assert counts.

INSERT INTO users (email, full_name, active, role, created_at)
SELECT
  'user' || i || '@example.com',
  'Utente ' || i,
  (i % 7) <> 0,
  (ARRAY['admin', 'staff', 'user'])[1 + (i % 3)],
  now() - (i || ' hours')::interval
FROM generate_series(1, 1000) AS i;

INSERT INTO tags (name)
SELECT 'tag-' || i FROM generate_series(1, 50) AS i;

INSERT INTO posts (author_id, title, slug, body, status, published_at, created_at)
SELECT
  1 + (i % 1000),
  'Post numero ' || i,
  'post-' || i,
  'Contenuto del post ' || i || '. Lorem ipsum dolor sit amet.',
  (ARRAY['draft', 'published', 'archived'])[1 + (i % 3)],
  CASE WHEN i % 3 = 1 THEN now() - (i || ' hours')::interval ELSE NULL END,
  now() - (i || ' hours')::interval
FROM generate_series(1, 5000) AS i;

INSERT INTO post_tags (post_id, tag_id)
SELECT i, 1 + ((i * 7) % 50) FROM generate_series(1, 5000) AS i
UNION
SELECT i, 1 + ((i * 13) % 50) FROM generate_series(1, 5000) AS i;

-- 50k comments: the "large table" pagination has to stay fluid on.
-- parent_id points a few rows back → always an existing id (serial order).
INSERT INTO comments (post_id, author_id, parent_id, body, created_at)
SELECT
  1 + (i % 5000),
  1 + (i % 1000),
  CASE WHEN i % 7 = 0 AND i > 10 THEN i - 5 ELSE NULL END,
  'Commento ' || i || CASE WHEN i % 11 = 0 THEN ' con la parola magica: pizza' ELSE '' END,
  now() - (i || ' minutes')::interval
FROM generate_series(1, 50000) AS i;

INSERT INTO products (name, sku, price, status, stock)
SELECT
  'Prodotto ' || i,
  'SKU-' || lpad(i::text, 4, '0'),
  round((((i * 37) % 9000) + 100)::numeric / 100, 2)::double precision,
  (ARRAY['available', 'out_of_stock', 'discontinued'])[1 + (i % 3)],
  (i * 3) % 50
FROM generate_series(1, 200) AS i;

INSERT INTO orders (user_id, status, total_cents, metadata, placed_at)
SELECT
  1 + (i % 1000),
  (ARRAY['pending', 'paid', 'shipped', 'cancelled'])[1 + (i % 4)],
  (i * 137) % 100000,
  CASE WHEN i % 3 = 0 THEN jsonb_build_object('coupon', 'C-' || i, 'channel', 'web') ELSE NULL END,
  now() - (i || ' minutes')::interval
FROM generate_series(1, 20000) AS i;
