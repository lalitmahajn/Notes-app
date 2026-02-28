/**
 * ============================================================
 * Secure Notes — Application Logic
 * ============================================================
 *
 * Architecture:
 *   SupabaseService  → initialises and exposes the Supabase client
 *   AuthService      → sign-up, sign-in, sign-out, session helpers
 *   NotesService     → CRUD for the `notes` table (RLS enforced server-side)
 *   UIController     → DOM bindings, rendering, toast messages
 *
 * The first three modules are framework-agnostic and can be
 * reused if the UI is later rewritten in React / Vue.
 * ============================================================
 */

/* ──────────────────────────────────────────────
   CONFIGURATION — replace with your Supabase project values
   ────────────────────────────────────────────── */
const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON = '__SUPABASE_ANON_KEY__';

/* ──────────────────────────────────────────────
   SupabaseService
   ────────────────────────────────────────────── */
const SupabaseService = (() => {
  let client = null;

  /**
   * Initialise the Supabase client (singleton).
   * Uses the globally-loaded supabase-js from CDN.
   */
  function init() {
    if (client) return client;
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    console.log('[SupabaseService] Client initialised');
    return client;
  }

  function getClient() {
    if (!client) init();
    return client;
  }

  return { init, getClient };
})();

/* ──────────────────────────────────────────────
   AuthService
   ────────────────────────────────────────────── */
const AuthService = (() => {
  function _client() {
    return SupabaseService.getClient();
  }

  /**
   * Create a new account.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{data, error}>}
   */
  async function signUp(email, password) {
    const { data, error } = await _client().auth.signUp({ email, password });
    if (error) console.error('[AuthService] signUp error:', error.message);
    return { data, error };
  }

  /**
   * Sign in with email + password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{data, error}>}
   */
  async function signIn(email, password) {
    const { data, error } = await _client().auth.signInWithPassword({ email, password });
    if (error) console.error('[AuthService] signIn error:', error.message);
    return { data, error };
  }

  /**
   * Sign out the current user.
   * @returns {Promise<{error}>}
   */
  async function signOut() {
    const { error } = await _client().auth.signOut();
    if (error) console.error('[AuthService] signOut error:', error.message);
    return { error };
  }

  /**
   * Get the current session (persisted across refresh).
   * @returns {Promise<{session, error}>}
   */
  async function getSession() {
    const { data, error } = await _client().auth.getSession();
    return { session: data?.session ?? null, error };
  }

  /**
   * Subscribe to auth state changes.
   * @param {Function} callback — receives (event, session)
   */
  function onAuthStateChange(callback) {
    _client().auth.onAuthStateChange((event, session) => {
      console.log('[AuthService] Auth state changed:', event);
      callback(event, session);
    });
  }

  return { signUp, signIn, signOut, getSession, onAuthStateChange };
})();

/* ──────────────────────────────────────────────
   NotesService
   All queries go through Supabase with the user's JWT;
   Row Level Security on the `notes` table ensures a user
   can only access their own rows.
   ────────────────────────────────────────────── */
const NotesService = (() => {
  function _client() {
    return SupabaseService.getClient();
  }

  /**
   * Fetch all notes for the current user (ordered newest first).
   * @returns {Promise<{data, error}>}
   */
  async function fetchNotes() {
    const { data, error } = await _client()
      .from('notes')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) console.error('[NotesService] fetchNotes error:', error.message);
    return { data: data ?? [], error };
  }

  /**
   * Create a new note.
   * `user_id` is set automatically via RLS / default value.
   * @param {string} title
   * @param {string} content
   * @returns {Promise<{data, error}>}
   */
  async function createNote(title, content) {
    const { data: { session } } = await _client().auth.getSession();
    const { data, error } = await _client()
      .from('notes')
      .insert([{ title, content, user_id: session.user.id }])
      .select();
    if (error) console.error('[NotesService] createNote error:', error.message);
    return { data, error };
  }

  /**
   * Update an existing note.
   * @param {string} id
   * @param {string} title
   * @param {string} content
   * @returns {Promise<{data, error}>}
   */
  async function updateNote(id, title, content) {
    const { data, error } = await _client()
      .from('notes')
      .update({ title, content, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) console.error('[NotesService] updateNote error:', error.message);
    return { data, error };
  }

  /**
   * Delete a note by id.
   * @param {string} id
   * @returns {Promise<{error}>}
   */
  async function deleteNote(id) {
    const { error } = await _client()
      .from('notes')
      .delete()
      .eq('id', id);
    if (error) console.error('[NotesService] deleteNote error:', error.message);
    return { error };
  }

  return { fetchNotes, createNote, updateNote, deleteNote };
})();

/* ──────────────────────────────────────────────
   UIController
   Handles all DOM interactions.
   ────────────────────────────────────────────── */
const UIController = (() => {
  // ── DOM references ──
  const $ = (sel) => document.querySelector(sel);
  const authSection = $('#auth-section');
  const appSection = $('#app-section');
  const authForm = $('#auth-form');
  const authEmail = $('#auth-email');
  const authPassword = $('#auth-password');
  const authSubmitBtn = $('#auth-submit-btn');
  const authSubtitle = $('#auth-subtitle');
  const authToggleText = $('#auth-toggle-text');
  const authToggleBtn = $('#auth-toggle-btn');
  const userEmailEl = $('#user-email');
  const logoutBtn = $('#logout-btn');
  const notesGrid = $('#notes-grid');
  const notesCount = $('#notes-count');
  const newNoteBtn = $('#new-note-btn');
  const fabBtn = $('#fab-btn');
  const noteModal = $('#note-modal');
  const modalTitle = $('#modal-title');
  const noteForm = $('#note-form');
  const noteTitleInput = $('#note-title-input');
  const noteContentInput = $('#note-content-input');
  const modalCancelBtn = $('#modal-cancel-btn');
  const toastEl = $('#toast');

  let isSignUp = false;   // toggle auth mode
  let editingNoteId = null;    // null ⇒ creating, string ⇒ editing
  let toastTimeout = null;

  // ── Initialisation ──
  function init() {
    SupabaseService.init();
    bindEvents();
    restoreSession();
    listenAuthChanges();
  }

  function bindEvents() {
    authForm.addEventListener('submit', handleAuthSubmit);
    authToggleBtn.addEventListener('click', toggleAuthMode);
    logoutBtn.addEventListener('click', handleLogout);
    newNoteBtn.addEventListener('click', () => openModal());
    fabBtn.addEventListener('click', () => openModal());
    modalCancelBtn.addEventListener('click', closeModal);
    noteModal.addEventListener('click', (e) => {
      if (e.target === noteModal) closeModal();
    });
    noteForm.addEventListener('submit', handleNoteSave);
  }

  // ── Auth UI ──
  function toggleAuthMode() {
    isSignUp = !isSignUp;
    authSubmitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    authSubtitle.textContent = isSignUp ? 'Create a new account' : 'Sign in to access your notes';
    authToggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
    authToggleBtn.textContent = isSignUp ? 'Sign In' : 'Sign Up';
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) return;

    authSubmitBtn.disabled = true;
    authSubmitBtn.innerHTML = '<span class="spinner"></span>';

    let result;
    if (isSignUp) {
      result = await AuthService.signUp(email, password);
      if (!result.error) {
        showToast('Account created! Check your email to confirm.', 'success');
      }
    } else {
      result = await AuthService.signIn(email, password);
    }

    if (result.error) {
      showToast(result.error.message, 'error');
    }

    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  }

  async function handleLogout() {
    const { error } = await AuthService.signOut();
    if (error) {
      showToast('Logout failed: ' + error.message, 'error');
    }
  }

  // ── Session ──
  async function restoreSession() {
    const { session, error } = await AuthService.getSession();
    if (error) console.warn('[UIController] session restore error:', error.message);
    if (session) {
      showApp(session.user);
    } else {
      showAuth();
    }
  }

  function listenAuthChanges() {
    AuthService.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        showApp(session.user);
      } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
        showAuth();
      }
    });
  }

  // ── View toggling ──
  function showAuth() {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    authForm.reset();
  }

  function showApp(user) {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    userEmailEl.textContent = user.email;
    loadNotes();
  }

  // ── Notes rendering ──
  async function loadNotes() {
    notesGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem"><span class="spinner"></span></div>';
    const { data, error } = await NotesService.fetchNotes();

    if (error) {
      showToast('Failed to load notes', 'error');
      notesGrid.innerHTML = '';
      return;
    }

    renderNotes(data);
  }

  function renderNotes(notes) {
    notesCount.textContent = notes.length ? `(${notes.length})` : '';

    if (notes.length === 0) {
      notesGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🗒️</div>
          <p>No notes yet</p>
          <span>Tap the <strong>+ New Note</strong> button to get started.</span>
        </div>`;
      return;
    }

    notesGrid.innerHTML = notes
      .map((note, i) => noteCardHTML(note, i))
      .join('');

    // Bind card-level events
    notesGrid.querySelectorAll('.note-card').forEach((card) => {
      const id = card.dataset.id;
      card.addEventListener('click', (e) => {
        // ignore if a button inside was clicked
        if (e.target.closest('button')) return;
        const note = notes.find((n) => n.id === id);
        if (note) openModal(note);
      });
    });

    notesGrid.querySelectorAll('.btn-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.note-card').dataset.id;
        const note = notes.find((n) => n.id === id);
        if (note) openModal(note);
      });
    });

    notesGrid.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.closest('.note-card').dataset.id;
        if (!confirm('Delete this note?')) return;
        const { error } = await NotesService.deleteNote(id);
        if (error) {
          showToast('Delete failed', 'error');
        } else {
          showToast('Note deleted', 'success');
          loadNotes();
        }
      });
    });
  }

  function noteCardHTML(note, index) {
    const date = new Date(note.updated_at || note.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    return `
      <div class="note-card" data-id="${note.id}" style="animation-delay:${index * 0.06}s">
        <div class="note-title">${escapeHTML(note.title || 'Untitled')}</div>
        <div class="note-content">${escapeHTML(note.content || '')}</div>
        <div class="note-meta">
          <span class="note-date">${date}</span>
          <div class="note-actions">
            <button class="btn btn-sm btn-ghost btn-edit" title="Edit">✏️</button>
            <button class="btn btn-sm btn-danger btn-delete" title="Delete">🗑️</button>
          </div>
        </div>
      </div>`;
  }

  // ── Modal ──
  function openModal(note = null) {
    editingNoteId = note ? note.id : null;
    modalTitle.textContent = note ? 'Edit Note' : 'New Note';
    noteTitleInput.value = note ? note.title : '';
    noteContentInput.value = note ? note.content : '';
    noteModal.classList.add('active');
    noteTitleInput.focus();
  }

  function closeModal() {
    noteModal.classList.remove('active');
    noteForm.reset();
    editingNoteId = null;
  }

  async function handleNoteSave(e) {
    e.preventDefault();
    const title = noteTitleInput.value.trim();
    const content = noteContentInput.value.trim();

    if (!title) {
      showToast('Title is required', 'error');
      return;
    }

    const saveBtn = $('#modal-save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>';

    let result;
    if (editingNoteId) {
      result = await NotesService.updateNote(editingNoteId, title, content);
    } else {
      result = await NotesService.createNote(title, content);
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';

    if (result.error) {
      showToast(result.error.message, 'error');
      return;
    }

    showToast(editingNoteId ? 'Note updated' : 'Note created', 'success');
    closeModal();
    loadNotes();
  }

  // ── Toast ──
  function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = type;
    // trigger reflow to restart animation
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3200);
  }

  // ── Helpers ──
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { init };
})();

/* ──────────────────────────────────────────────
   Boot
   ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  UIController.init();
});
