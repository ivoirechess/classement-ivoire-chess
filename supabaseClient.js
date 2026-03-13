import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1) Copiez ce fichier en `supabaseClient.js`
// 2) Remplacez les placeholders par vos valeurs projet Supabase.
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
