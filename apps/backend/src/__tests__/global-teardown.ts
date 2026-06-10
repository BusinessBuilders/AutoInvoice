import * as fs from 'fs';
import { TEST_DB_URL_FILE } from './global-setup';

export default async function globalTeardown(): Promise<void> {
  if (fs.existsSync(TEST_DB_URL_FILE)) {
    fs.unlinkSync(TEST_DB_URL_FILE);
  }
  await globalThis.__TEST_PG_CONTAINER__?.stop();
}
