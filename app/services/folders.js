/**
 * FoldersService — Remote CRUD for folders (online-only)
 * Depends on: SupabaseService (from supabase.js)
 */
const FoldersService = (() => {
    const _c = () => SupabaseService.getClient();

    async function fetchFolders() {
        const { data, error } = await _c()
            .from('folders').select('*').order('created_at', { ascending: true });
        if (error) console.error('[FoldersService] fetchFolders:', error.message);
        return { data: data ?? [], error };
    }

    async function createFolder(name, color) {
        const { data: { session } } = await _c().auth.getSession();
        const { data, error } = await _c()
            .from('folders')
            .insert([{ name, color, user_id: session.user.id }])
            .select();
        if (error) console.error('[FoldersService] createFolder:', error.message);
        return { data, error };
    }

    async function updateFolder(id, name, color) {
        const { data, error } = await _c()
            .from('folders').update({ name, color }).eq('id', id).select();
        if (error) console.error('[FoldersService] updateFolder:', error.message);
        return { data, error };
    }

    async function deleteFolder(id) {
        const { error } = await _c().from('folders').delete().eq('id', id);
        if (error) console.error('[FoldersService] deleteFolder:', error.message);
        return { error };
    }

    return { fetchFolders, createFolder, updateFolder, deleteFolder };
})();
