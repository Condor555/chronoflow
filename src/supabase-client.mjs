// Compatibility entry point. The application bootstrap uses the immutable,
// versioned URL below; this file remains safe for older direct imports.
export {
  createConfiguredSupabaseClient,
  hasSupabaseConfig,
  readSupabaseConfig,
  supabase
} from './supabase-client.v3.0.3.mjs';
