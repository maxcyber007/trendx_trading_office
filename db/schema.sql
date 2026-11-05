-- one row per MT5 account; a login is unique only together with its broker server
CREATE TABLE IF NOT EXISTS accounts (
  id          BIGSERIAL PRIMARY KEY,
  login       BIGINT NOT NULL,
  server      TEXT NOT NULL,
  company     TEXT NOT NULL DEFAULT '',
  currency    TEXT NOT NULL DEFAULT 'USD',
  is_demo     BOOLEAN NOT NULL DEFAULT TRUE,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (login, server)
);

-- every deal; the unique key makes a repeated send harmless
CREATE TABLE IF NOT EXISTS deals (
  account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ticket      BIGINT NOT NULL,
  position_id BIGINT NOT NULL DEFAULT 0,
  deal_time   TIMESTAMP NOT NULL,          -- broker server clock, as shown in MT5
  symbol      TEXT NOT NULL DEFAULT '',
  deal_type   INT NOT NULL,                -- 0 buy, 1 sell, 2 balance, 3 credit
  entry       INT NOT NULL DEFAULT 0,      -- 0 in, 1 out, 2 in/out, 3 out by
  magic       BIGINT NOT NULL DEFAULT 0,
  model       INT NOT NULL DEFAULT 0,      -- magic % 1000
  volume      NUMERIC(14,2) NOT NULL DEFAULT 0,
  price       NUMERIC(16,5) NOT NULL DEFAULT 0,
  commission  NUMERIC(16,2) NOT NULL DEFAULT 0,
  swap        NUMERIC(16,2) NOT NULL DEFAULT 0,
  profit      NUMERIC(16,2) NOT NULL DEFAULT 0,
  comment     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (account_id, ticket)
);
CREATE INDEX IF NOT EXISTS deals_account_time ON deals (account_id, deal_time);

-- the latest picture of each account
CREATE TABLE IF NOT EXISTS account_state (
  account_id  BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  balance     NUMERIC(16,2) NOT NULL DEFAULT 0,
  equity      NUMERIC(16,2) NOT NULL DEFAULT 0,
  margin      NUMERIC(16,2) NOT NULL DEFAULT 0,
  server_time TIMESTAMP,
  ea_alive    BOOLEAN NOT NULL DEFAULT FALSE,
  ea_state    JSONB,
  positions   JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- candles, volatility and news sent by the bridge
ALTER TABLE account_state ADD COLUMN IF NOT EXISTS market JSONB;

-- equity samples, one per account per 5 minutes, for the drawdown figure
CREATE TABLE IF NOT EXISTS equity_samples (
  account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  bucket      TIMESTAMPTZ NOT NULL,
  balance     NUMERIC(16,2) NOT NULL,
  equity      NUMERIC(16,2) NOT NULL,
  PRIMARY KEY (account_id, bucket)
);
