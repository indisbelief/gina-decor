import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

type Db = ReturnType<typeof createDb>;

function createDb() {
  return drizzle(neon(process.env.DATABASE_URL!), { schema });
}

let _db: Db | null = null;

// Ленивая инициализация: во время `next build` модуль импортируется,
// когда DATABASE_URL ещё может быть недоступен.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    _db ??= createDb();
    return _db[prop as keyof Db];
  },
});
