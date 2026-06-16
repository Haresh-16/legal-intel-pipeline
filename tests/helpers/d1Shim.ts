import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Vite's static import analysis doesn't yet recognize "node:sqlite" as a builtin
// (it's a newer experimental Node module), so it gets loaded via createRequire
// instead of a static `import` — same workaround used in db-migration.test.ts.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(join(__dirname, "../../worker/src/db/migrations/0001_init.sql"), "utf-8");

interface D1ShimResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: Record<string, unknown>;
}

const SELECT_LIKE = /^\s*(select|pragma|with)/i;

/**
 * A minimal in-memory D1Database stand-in, backed by Node's built-in
 * node:sqlite, that implements just enough of the Cloudflare D1 surface
 * (prepare/bind/all/run/raw + batch) for drizzle-orm/d1 to operate against it
 * in tests — there is no real D1 binding available outside `wrangler dev`.
 */
export function createTestD1Database(): D1Database {
  const sqliteDb = new DatabaseSync(":memory:");
  sqliteDb.exec(migrationSql);

  function bindStatement(sql: string, params: unknown[]) {
    function exec(): D1ShimResult {
      const stmt = sqliteDb.prepare(sql);
      if (SELECT_LIKE.test(sql.trim())) {
        const rows = stmt.all(...(params as never[])) as Record<string, unknown>[];
        return { results: rows, success: true, meta: {} };
      }
      stmt.run(...(params as never[]));
      return { results: [], success: true, meta: {} };
    }

    return {
      _exec: exec,
      async all() {
        return exec();
      },
      async run() {
        return exec();
      },
      async raw() {
        return exec().results.map((row) => Object.values(row));
      },
    };
  }

  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return bindStatement(sql, params);
        },
      };
    },
    async batch(statements: ReturnType<typeof bindStatement>[]) {
      return statements.map((s) => s._exec());
    },
  };

  return db as unknown as D1Database;
}
