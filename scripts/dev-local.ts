import { resolve } from "node:path";
import { startBackend } from "../src/bootstrap.js";
import { connectLocalDatabase } from "../src/db/local.js";

// Explicit opt-in local database. Existing Supabase/Postgres data is never touched.
await startBackend(connectLocalDatabase(resolve("agents/.local/frontend-db")));
