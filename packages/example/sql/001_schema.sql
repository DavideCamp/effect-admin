-- effect-admin example domain (blog + shop) — DDL, roadmap F1.
-- The DB belongs to the example app (D5): invariants live in constraints,
-- the admin's schema validation sits in front, the constraints are the net.

CREATE TABLE users (
  id         serial PRIMARY KEY,
  email      text NOT NULL UNIQUE CHECK (length(email) >= 3),
  full_name  text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  role       text NOT NULL CHECK (role IN ('admin', 'staff', 'user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id   serial PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (length(name) >= 1)
);

CREATE TABLE posts (
  id           serial PRIMARY KEY,
  author_id    int NOT NULL REFERENCES users(id),
  title        text NOT NULL CHECK (length(title) >= 1),
  slug         text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  body         text NOT NULL,
  status       text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- M2M bridge (widget arrives in F4; the table exists so the domain is honest)
CREATE TABLE post_tags (
  post_id int NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  int NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE comments (
  id         serial PRIMARY KEY,
  post_id    int NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  int NOT NULL REFERENCES users(id),
  parent_id  int REFERENCES comments(id), -- self-FK, NULL = top-level
  body       text NOT NULL CHECK (length(body) >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id     serial PRIMARY KEY,
  name   text NOT NULL CHECK (length(name) >= 1),
  sku    text NOT NULL UNIQUE CHECK (sku ~ '^[A-Z0-9-]+$'),
  -- double precision, not numeric: Schema.Number round-trips as a JS
  -- number; money-like exactness uses integer cents (see orders)
  price  double precision NOT NULL CHECK (price > 0),
  status text NOT NULL CHECK (status IN ('available', 'out_of_stock', 'discontinued')),
  stock  int NOT NULL DEFAULT 0
);

-- Read-only in the admin (D5): order invariants belong to the app's services.
CREATE TABLE orders (
  id          serial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id),
  status      text NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  total_cents int NOT NULL CHECK (total_cents >= 0),
  metadata    jsonb,
  placed_at   timestamptz NOT NULL DEFAULT now()
);

-- The columns the list page filters/sorts/searches on (roadmap F2).
CREATE INDEX comments_post_id_idx ON comments (post_id);
CREATE INDEX comments_created_at_idx ON comments (created_at);
CREATE INDEX posts_status_idx ON posts (status);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_user_id_idx ON orders (user_id);
