CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "accounts" (
  "account_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "login" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "status" "AccountStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("account_id"),
  CONSTRAINT "accounts_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "accounts_login_key" UNIQUE ("login"),
  CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "sessions" (
  "session_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id"),
  CONSTRAINT "sessions_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "sessions_account_id_expires_at_idx" ON "sessions"("account_id", "expires_at");
