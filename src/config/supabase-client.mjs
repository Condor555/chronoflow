import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import * as config from '../config.js';

/**
 * Contratto Chrono Flow 2.9.4:
 * - SUPABASE_URL
 * - SUPABASE_PUBLISHABLE_KEY
 *
 * Non rinomina e non richiede nuove credenziali. L'import namespace evita
 * dipendenze da export non previsti dalla configurazione baseline.
 */
export function readSupabaseConfig(source = config) {
  return {
    url: source.SUPABASE_URL,
    publishableKey: source.SUPABASE_PUBLISHABLE_KEY
  };
}

export function hasSupabaseConfig(source = config) {
  const { url, publishableKey } = readSupabaseConfig(source);
  if (typeof url !== 'string' || typeof publishableKey !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && Boolean(parsed.hostname)
      && publishableKey.trim().length > 0
      && !publishableKey.includes('YOUR_');
  } catch {
    return false;
  }
}

export function createConfiguredSupabaseClient(source = config, factory = createClient) {
  if (!hasSupabaseConfig(source)) return null;
  const { url, publishableKey } = readSupabaseConfig(source);
  return factory(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export const supabase = createConfiguredSupabaseClient();
