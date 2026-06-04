// Supabase client for Ottie Golf. Reuses the existing Pocket Room
// Supabase project (env vars are already in Vercel from prior work).
// Returns null when env isn't set so dev/preview builds without
// keys still work — match flow degrades to "local solo only".

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_CONFIGURED = Boolean(url && anonKey);

function safeCreate(): SupabaseClient | null {
    if (!SUPABASE_CONFIGURED) return null;
    try {
        return createClient(url!, anonKey!, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
    } catch (e) {
        console.warn('[supabase] createClient threw', e);
        return null;
    }
}

export const supabase: SupabaseClient | null = safeCreate();
