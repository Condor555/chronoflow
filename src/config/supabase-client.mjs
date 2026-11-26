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
  const rawUrl = source?.SUPABASE_URL;
  const rawPublishableKey = source?.SUPABASE_PUBLISHABLE_KEY;
  return {
    url: typeof rawUrl === 'string' ? rawUrl.trim().replace(/\/$/, '') : '',
    publishableKey: typeof rawPublishableKey === 'string' ? rawPublishableKey.trim() : ''
  };
}

function isUsableConfig({ url, publishableKey }) {
  // Le nuove chiavi Supabase `sb_publishable_…` sono opache: non sono JWT e
  // non devono essere rifiutate in base a prefisso, lunghezza o contenuto.
  return /^https:\/\/[^\s/]+\.supabase\.co$/i.test(url)
    && publishableKey.length > 0;
}

export function hasSupabaseConfig(source = config) {
  return isUsableConfig(readSupabaseConfig(source));
}

export function createConfiguredSupabaseClient(source = config, factory = createClient) {
  const normalized = readSupabaseConfig(source);
  if (!isUsableConfig(normalized)) return null;
  return factory(normalized.url, normalized.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export const supabase = createConfiguredSupabaseClient();
