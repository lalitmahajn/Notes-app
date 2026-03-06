/**
 * SupabaseService — Supabase client singleton
 * Depends on: SUPABASE_URL, SUPABASE_ANON (from config.js)
 */
const SupabaseService = (() => {
    let client = null;
    function init() {
        if (client) return client;
        client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
        console.log('[SupabaseService] Client initialised');
        return client;
    }
    function getClient() { if (!client) init(); return client; }
    return { init, getClient };
})();
