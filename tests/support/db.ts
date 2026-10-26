import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "@/server/db/driver";
import { setDbForTests } from "@/server/db";

/** Abre um banco migrado numa pasta temporária e o registra como conexão global. Chame `cleanup()` no afterEach. */
export function useTestDb(): { db: Db; dataDir: string; cleanup: () => void } {
  const dataDir = mkdtempSync(join(tmpdir(), "nexo-test-"));
  const db = openDb(join(dataDir, "nexo.sqlite"));
  setDbForTests(db, dataDir);
  return {
    db,
    dataDir,
    cleanup: () => {
      setDbForTests(null);
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
