/**
 * Applies the Drizzle SQL migrations to a Postgres database in filename order.
 *
 * Usage:
 *   DB_HOST=db.<ref>.supabase.co DB_PASSWORD=... bun run scripts/apply-migrations.ts
 *   LOVABLE_DB_MIGRATION_URL=postgresql://... bun run scripts/apply-migrations.ts
 *
 * Safe to re-run: every migration is written with IF NOT EXISTS / IF EXISTS.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const dir = join(import.meta.dir, "..", "drizzle", "migrations");
const files = readdirSync(dir)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name))
  .sort();

if (files.length === 0) {
  throw new Error(`No migrations found in ${dir}`);
}

const url = process.env["LOVABLE_DB_MIGRATION_URL"];
const host = process.env["DB_HOST"];
const password = process.env["DB_PASSWORD"];

const sql = url
  ? postgres(url, { ssl: "require", max: 1, onnotice: () => {} })
  : postgres({
      host,
      port: 5432,
      database: "postgres",
      username: "postgres",
      password,
      ssl: "require",
      max: 1,
      onnotice: () => {},
    });

try {
  for (const name of files) {
    const body = readFileSync(join(dir, name), "utf8");
    process.stdout.write(`applying ${name} ... `);
    await sql.unsafe(body);
    process.stdout.write("ok\n");
  }
  console.log("done");
} finally {
  await sql.end({ timeout: 5 });
}
