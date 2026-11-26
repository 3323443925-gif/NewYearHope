import type { LanternRepository } from './types';
import { SqliteLanternRepository } from './sqliteRepo';
import { SupabaseLanternRepository } from './supabaseRepo';

declare global {
  // eslint-disable-next-line no-var
  var __starlightRepo: LanternRepository | undefined;
}

export function getLanternRepo(): LanternRepository {
  if (globalThis.__starlightRepo) {
    return globalThis.__starlightRepo;
  }

  if (
    process.env.DATA_PROVIDER === 'supabase' &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    globalThis.__starlightRepo = new SupabaseLanternRepository(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } else {
    globalThis.__starlightRepo = new SqliteLanternRepository();
  }

  return globalThis.__starlightRepo;
}
