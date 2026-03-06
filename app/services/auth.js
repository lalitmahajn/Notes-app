/**
 * AuthService — sign-up, sign-in, sign-out, session
 * Depends on: SupabaseService (from supabase.js)
 */
const AuthService = (() => {
    const _c = () => SupabaseService.getClient();

    async function signUp(email, password) {
        const { data, error } = await _c().auth.signUp({ email, password });
        if (error) console.error('[AuthService] signUp:', error.message);
        return { data, error };
    }

    async function signIn(email, password) {
        const { data, error } = await _c().auth.signInWithPassword({ email, password });
        if (error) console.error('[AuthService] signIn:', error.message);
        return { data, error };
    }

    async function signOut() {
        const { error } = await _c().auth.signOut();
        if (error) console.error('[AuthService] signOut:', error.message);
        return { error };
    }

    async function getSession() {
        const { data, error } = await _c().auth.getSession();
        return { session: data?.session ?? null, error };
    }

    function onAuthStateChange(cb) {
        _c().auth.onAuthStateChange((event, session) => {
            console.log('[AuthService] Auth state:', event);
            cb(event, session);
        });
    }

    return { signUp, signIn, signOut, getSession, onAuthStateChange };
})();
