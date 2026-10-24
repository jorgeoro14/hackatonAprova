import { connectLocalDatabase } from "../../src/db/local.js";
import { migrar } from "../../src/db/migracoes.js";

export async function bancoDeTeste() {
  const database = connectLocalDatabase();
  await migrar(database);
  return database;
}
