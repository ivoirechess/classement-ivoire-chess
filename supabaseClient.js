import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1) Copiez ce fichier en `supabaseClient.js`
// 2) Remplacez les placeholders par vos valeurs projet Supabase.
const SUPABASE_URL = 'https://hcqqdivtbyugpdzlmyia.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_z5OBU3VhInIkwkvy5vMfwg_ERM972a0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
