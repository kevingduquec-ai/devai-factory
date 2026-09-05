-- Seeds the first platform admin (super-admin login, /admin), since nothing
-- else creates one - platform_admins starts empty and AdminAuthService has
-- no self-registration route, so without this row the /admin login screen
-- has no credentials that could ever work on a fresh deploy. ON CONFLICT
-- makes it a no-op everywhere this migration has already run (local dev
-- included), so it never overwrites a real admin that already exists.
INSERT INTO "platform_admins" ("id", "email", "name", "password_hash", "updated_at")
VALUES (
  '42f64ea4-9598-47a7-af56-122982bf9b0f',
  'admin@qubit.app',
  'Platform Admin',
  '$argon2id$v=19$m=65536,t=3,p=4$L1+tNp9LqSxr71Pe9aeFWg$Jrgi4CEWF9vdJe8OxZA6wv4JUTkJejxVN5P7r7Us9Lo',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO NOTHING;
