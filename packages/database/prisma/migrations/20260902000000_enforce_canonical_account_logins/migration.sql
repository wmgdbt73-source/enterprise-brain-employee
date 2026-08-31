-- Login lookup is case-insensitive. Persist only its canonical representation
-- so the ordinary unique index is also a normalized-identity boundary.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_login_canonical_check"
  CHECK ("login" = lower(btrim("login")));
