-- Reference design: production inventory schema (PostgreSQL 16+).
--
-- Redis decides who is holding a seat right now. Postgres decides who owns it.
-- A double sale is not prevented by application logic alone: it is impossible
-- at the schema level, because a seat can have at most one ticket row.

create table events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_at   timestamptz not null,
  on_sale_at  timestamptz not null
);

create table seats (
  event_id    uuid not null references events (id),
  seat_id     text not null,
  section_id  text not null,
  row_label   text not null,
  col         integer not null,
  price_cents bigint not null check (price_cents >= 0),
  primary key (event_id, seat_id)
);

create table orders (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events (id),
  customer_id       uuid not null,
  -- Client-generated per checkout attempt. A retried or double-clicked
  -- "Pay" returns the same order instead of creating a second one.
  idempotency_key   text not null,
  status            text not null
                    check (status in ('pending_payment', 'paid', 'cancelled', 'expired')),
  total_cents       bigint not null check (total_cents >= 0),
  payment_intent_id text unique,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  unique (customer_id, idempotency_key)
);

-- The hard guarantee. Two transactions inserting the same (event_id, seat_id)
-- cannot both commit: the second gets unique_violation (23505) and rolls back.
create table tickets (
  event_id  uuid not null,
  seat_id   text not null,
  order_id  uuid not null references orders (id) on delete cascade,
  primary key (event_id, seat_id),
  foreign key (event_id, seat_id) references seats (event_id, seat_id)
);

create index tickets_order_idx on tickets (order_id);

-- Expiry worker scans only what can expire.
create index orders_pending_expiry_idx
  on orders (expires_at)
  where status = 'pending_payment';

-- Transactional outbox. A sale and its "seat sold" broadcast commit together,
-- so the live map can never show a seat as free after it was sold.
create table seat_outbox (
  id          bigserial primary key,
  event_id    uuid not null,
  seat_ids    text[] not null,
  status      text not null check (status in ('sold', 'released')),
  created_at  timestamptz not null default now(),
  relayed_at  timestamptz
);

create index seat_outbox_pending_idx on seat_outbox (id) where relayed_at is null;
