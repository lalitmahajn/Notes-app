/**
 * NotesService — Remote API (Supabase)
 * Used ONLY by SyncEngine. UI never calls these directly.
 * Depends on: SupabaseService (from supabase.js)
 */
const NotesService = (() => {
    const _c = () => SupabaseService.getClient();

    async function fetchNotes() {
        const { data, error } = await _c()
            .from('notes').select('*').order('updated_at', { ascending: false });
        if (error) console.error('[NotesService] fetchNotes:', error.message);
        return { data: data ?? [], error };
    }

    async function createNote(note) {
        const { data, error } = await _c()
            .from('notes')
            .insert([{
                title: note.title,
                content: note.content,
                is_pinned: note.is_pinned || false,
                tags: note.tags || [],
                folder_id: note.folder_id || null,
                user_id: note.user_id,
            }])
            .select();
        if (error) console.error('[NotesService] createNote:', error.message);
        return { data, error };
    }

    async function updateNote(id, fields) {
        if (fields.folder_id === '') fields.folder_id = null;
        const { data, error } = await _c()
            .from('notes').update(fields).eq('id', id).select();
        if (error) console.error('[NotesService] updateNote:', error.message);
        return { data, error };
    }

    async function deleteNote(id) {
        const { error } = await _c().from('notes').delete().eq('id', id);
        if (error) console.error('[NotesService] deleteNote:', error.message);
        return { error };
    }

    return { fetchNotes, createNote, updateNote, deleteNote };
})();
