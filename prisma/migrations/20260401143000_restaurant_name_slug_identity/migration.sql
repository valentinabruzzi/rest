DROP INDEX IF EXISTS "Restaurant_slug_key";

CREATE UNIQUE INDEX "Restaurant_name_slug_key"
ON "Restaurant"("name", "slug");
