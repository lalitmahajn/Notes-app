/**
 * ============================================================
 * Secure Notes v2 — Application Logic
 * ============================================================
 *
 * Modules:
 *   SupabaseService  → Supabase client singleton
 *   AuthService      → sign-up, sign-in, sign-out, session
 *   NotesService     → CRUD for notes (RLS enforced server-side)
 *   FoldersService   → CRUD for folders (RLS enforced server-side)
 *   MarkdownService  → markdown → HTML via marked.js
 *   UIController     → DOM, rendering, search, sort, tags, folders, auto-save
 * ============================================================
 */

/* ──────────────────────────────────────────────
   CONFIGURATION
   ────────────────────────────────────────────── */
const SUPABASE_URL = 'https://kafticldfipzbvnowrqe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthZnRpY2xkZmlwemJ2bm93cnFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzA4NTcsImV4cCI6MjA4Nzg0Njg1N30.JfJR9tdtScf0JmqIHmLREaRq4r7vwKe5Z9_QVcVpBz0';

/* ──────────────────────────────────────────────
   SupabaseService
   ────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   AuthService
   ────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   FoldersService
   ────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   NotesService
   ────────────────────────────────────────────── */
const NotesService = (() => {
  const _c = () => SupabaseService.getClient();

  async function fetchNotes() {
    const { data, error } = await _c()
      .from('notes').select('*').order('updated_at', { ascending: false });
    if (error) console.error('[NotesService] fetchNotes:', error.message);
    return { data: data ?? [], error };
  }

  async function createNote(title, content, { is_pinned = false, tags = [], folder_id = null } = {}) {
    const { data: { session } } = await _c().auth.getSession();
    const { data, error } = await _c()
      .from('notes')
      .insert([{ title, content, is_pinned, tags, folder_id: folder_id || null, user_id: session.user.id }])
      .select();
    if (error) console.error('[NotesService] createNote:', error.message);
    return { data, error };
  }

  async function updateNote(id, fields) {
    fields.updated_at = new Date().toISOString();
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

/* ──────────────────────────────────────────────
   MarkdownService
   ────────────────────────────────────────────── */
const MarkdownService = (() => {
  let ready = false;

  function init() {
    if (typeof marked !== 'undefined' && !ready) {
      marked.setOptions({ breaks: true, gfm: true });
      ready = true;
    }
  }

  function render(md) {
    init();
    if (!ready) return escapeHTML(md);
    try { return marked.parse(md || ''); }
    catch { return escapeHTML(md); }
  }

  function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { render, escapeHTML };
})();

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

/** Return a human-friendly relative time string */
function relativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Debounce helper */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ──────────────────────────────────────────────
   UIController
   ────────────────────────────────────────────── */
const UIController = (() => {
  const $ = (sel) => document.querySelector(sel);

  // DOM refs
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
  const notesHeading = $('#notes-heading');
  const newNoteBtn = $('#new-note-btn');
  const fabBtn = $('#fab-btn');
  const noteModal = $('#note-modal');
  const modalTitle = $('#modal-title');
  const noteForm = $('#note-form');
  const noteTitleInput = $('#note-title-input');
  const noteContentInput = $('#note-content-input');
  const notePinInput = $('#note-pin-input');
  const noteFolderSelect = $('#note-folder-select');
  const tagInputWrapper = $('#tag-input-wrapper');
  const tagInput = $('#tag-input');
  const modalCancelBtn = $('#modal-cancel-btn');
  const autosaveStatus = $('#autosave-status');
  const searchInput = $('#search-input');
  const sortSelect = $('#sort-select');
  const tagFilterBar = $('#tag-filter-bar');
  const sidebar = $('#sidebar');
  const sidebarBackdrop = $('#sidebar-backdrop');
  const sidebarToggle = $('#sidebar-toggle-btn');
  const folderList = $('#folder-list');
  const allNotesCount = $('#all-notes-count');
  const newFolderBtn = $('#new-folder-btn');
  const folderModal = $('#folder-modal');
  const folderModalTitle = $('#folder-modal-title');
  const folderForm = $('#folder-form');
  const folderNameInput = $('#folder-name-input');
  const folderColorPicker = $('#folder-color-picker');
  const folderCancelBtn = $('#folder-cancel-btn');
  const pwaInstallBtn = $('#pwa-install-btn');
  const toastEl = $('#toast');

  // State
  let isSignUp = false;
  let editingNoteId = null;
  let toastTimeout = null;
  let allNotes = [];
  let allFolders = [];
  let currentTags = [];         // tags in the modal input
  let activeFolder = 'all';      // filter
  let activeTagFilter = null;       // filter by tag
  let searchQuery = '';
  let editingFolderId = null;
  let selectedFolderColor = '#6c63ff';
  let deferredPWAPrompt = null;

  // Auto-save
  let autoSaveTimer = null;
  let lastSavedData = null;

  // ── Init ──
  function init() {
    SupabaseService.init();
    bindEvents();
    restoreSession();
    listenAuthChanges();
    registerServiceWorker();
  }

  function bindEvents() {
    // Auth
    authForm.addEventListener('submit', handleAuthSubmit);
    authToggleBtn.addEventListener('click', toggleAuthMode);
    logoutBtn.addEventListener('click', handleLogout);

    // Notes
    newNoteBtn.addEventListener('click', () => openNoteModal());
    fabBtn.addEventListener('click', () => openNoteModal());
    modalCancelBtn.addEventListener('click', closeNoteModal);
    noteModal.addEventListener('click', (e) => { if (e.target === noteModal) closeNoteModal(); });
    noteForm.addEventListener('submit', handleNoteSave);

    // Tags input
    tagInput.addEventListener('keydown', handleTagKeydown);
    tagInputWrapper.addEventListener('click', () => tagInput.focus());

    // Auto-save — debounced
    const triggerAutoSave = debounce(() => autoSave(), 1500);
    noteTitleInput.addEventListener('input', triggerAutoSave);
    noteContentInput.addEventListener('input', triggerAutoSave);

    // Search
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderFilteredNotes();
    });

    // Sort
    sortSelect.addEventListener('change', renderFilteredNotes);

    // Sidebar
    sidebarToggle.addEventListener('click', toggleSidebar);
    sidebarBackdrop.addEventListener('click', toggleSidebar);
    newFolderBtn.addEventListener('click', () => openFolderModal());

    // Folder modal
    folderCancelBtn.addEventListener('click', closeFolderModal);
    folderModal.addEventListener('click', (e) => { if (e.target === folderModal) closeFolderModal(); });
    folderForm.addEventListener('submit', handleFolderSave);
    folderColorPicker.querySelectorAll('.color-swatch').forEach((s) => {
      s.addEventListener('click', () => {
        folderColorPicker.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        selectedFolderColor = s.dataset.color;
      });
    });

    // PWA
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPWAPrompt = e;
      pwaInstallBtn.classList.remove('hidden');
    });
    pwaInstallBtn.addEventListener('click', async () => {
      if (!deferredPWAPrompt) return;
      deferredPWAPrompt.prompt();
      await deferredPWAPrompt.userChoice;
      deferredPWAPrompt = null;
      pwaInstallBtn.classList.add('hidden');
    });
  }

  // ── Auth ──
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
      if (!result.error) showToast('Account created! Check your email to confirm.', 'success');
    } else {
      result = await AuthService.signIn(email, password);
    }
    if (result.error) showToast(result.error.message, 'error');
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  }

  async function handleLogout() {
    const { error } = await AuthService.signOut();
    if (error) showToast('Logout failed: ' + error.message, 'error');
  }

  // ── Session ──
  async function restoreSession() {
    const { session } = await AuthService.getSession();
    if (session) showApp(session.user); else showAuth();
  }

  function listenAuthChanges() {
    AuthService.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) showApp(session.user);
      else if (event === 'SIGNED_OUT') showAuth();
    });
  }

  function showAuth() {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    authForm.reset();
  }

  function showApp(user) {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    userEmailEl.textContent = user.email;
    loadData();
  }

  // ── Data loading ──
  async function loadData() {
    await Promise.all([loadFolders(), loadNotes()]);
  }

  async function loadFolders() {
    const { data } = await FoldersService.fetchFolders();
    allFolders = data;
    renderFolders();
    populateFolderSelects();
  }

  async function loadNotes() {
    notesGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem"><span class="spinner"></span></div>';
    const { data, error } = await NotesService.fetchNotes();
    if (error) { showToast('Failed to load notes', 'error'); notesGrid.innerHTML = ''; return; }
    allNotes = data;
    collectAllTags();
    renderFilteredNotes();
    updateFolderCounts();
  }

  // ── Folders rendering ──
  function renderFolders() {
    // Keep the "All Notes" item, remove the rest
    const allItem = folderList.querySelector('[data-folder-id="all"]');
    folderList.innerHTML = '';
    folderList.appendChild(allItem);

    allFolders.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'sidebar-item' + (activeFolder === f.id ? ' active' : '');
      li.dataset.folderId = f.id;
      li.innerHTML = `
        <span class="folder-dot" style="background:${f.color}"></span>
        <span>${MarkdownService.escapeHTML(f.name)}</span>
        <span class="folder-count" data-count-folder="${f.id}"></span>
        <div class="folder-actions">
          <button class="btn-icon btn-edit-folder" title="Edit">✏️</button>
          <button class="btn-icon btn-delete-folder" title="Delete">🗑️</button>
        </div>`;
      li.addEventListener('click', (e) => {
        if (e.target.closest('.btn-edit-folder') || e.target.closest('.btn-delete-folder')) return;
        setActiveFolder(f.id, f.name);
      });
      li.querySelector('.btn-edit-folder').addEventListener('click', () => openFolderModal(f));
      li.querySelector('.btn-delete-folder').addEventListener('click', async () => {
        if (!confirm(`Delete folder "${f.name}"? Notes inside will be unassigned.`)) return;
        const { error } = await FoldersService.deleteFolder(f.id);
        if (error) { showToast('Delete failed', 'error'); return; }
        if (activeFolder === f.id) setActiveFolder('all', 'My Notes');
        showToast('Folder deleted', 'success');
        await loadData();
      });
      folderList.appendChild(li);
    });

    // Rebind "All Notes" click
    allItem.onclick = () => setActiveFolder('all', 'My Notes');
    if (activeFolder === 'all') allItem.classList.add('active');
    else allItem.classList.remove('active');
  }

  function setActiveFolder(id, name) {
    activeFolder = id;
    notesHeading.innerHTML = `${MarkdownService.escapeHTML(name)} <span class="notes-count" id="notes-count"></span>`;
    folderList.querySelectorAll('.sidebar-item').forEach(i => {
      i.classList.toggle('active', i.dataset.folderId === String(id));
    });
    renderFilteredNotes();
    // Close sidebar on mobile
    if (window.innerWidth <= 768) closeSidebar();
  }

  function updateFolderCounts() {
    allNotesCount.textContent = allNotes.length;
    allFolders.forEach(f => {
      const el = folderList.querySelector(`[data-count-folder="${f.id}"]`);
      if (el) el.textContent = allNotes.filter(n => n.folder_id === f.id).length;
    });
  }

  function populateFolderSelects() {
    noteFolderSelect.innerHTML = '<option value="">None</option>';
    allFolders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      noteFolderSelect.appendChild(opt);
    });
  }

  // ── Sidebar toggle ──
  function toggleSidebar() {
    sidebar.classList.toggle('open');
    sidebarBackdrop.classList.toggle('open');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('open');
  }

  // ── Tags ──
  let allUniqueTags = [];

  function collectAllTags() {
    const tagSet = new Set();
    allNotes.forEach(n => (n.tags || []).forEach(t => tagSet.add(t)));
    allUniqueTags = [...tagSet].sort();
    renderTagFilterBar();
  }

  function renderTagFilterBar() {
    tagFilterBar.innerHTML = '';
    if (allUniqueTags.length === 0) return;
    allUniqueTags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip' + (activeTagFilter === tag ? ' active' : '');
      chip.textContent = `#${tag}`;
      chip.addEventListener('click', () => {
        activeTagFilter = activeTagFilter === tag ? null : tag;
        renderTagFilterBar();
        renderFilteredNotes();
      });
      tagFilterBar.appendChild(chip);
    });
    if (activeTagFilter) {
      const clear = document.createElement('span');
      clear.className = 'tag-chip';
      clear.textContent = '✕ Clear';
      clear.addEventListener('click', () => { activeTagFilter = null; renderTagFilterBar(); renderFilteredNotes(); });
      tagFilterBar.appendChild(clear);
    }
  }

  function handleTagKeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.value.trim().replace(/,/g, '');
      if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        renderModalTags();
      }
      tagInput.value = '';
    } else if (e.key === 'Backspace' && !tagInput.value) {
      currentTags.pop();
      renderModalTags();
    }
  }

  function renderModalTags() {
    tagInputWrapper.querySelectorAll('.tag-chip').forEach(c => c.remove());
    currentTags.forEach((tag, i) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `#${MarkdownService.escapeHTML(tag)} <span class="tag-remove" data-idx="${i}">✕</span>`;
      chip.querySelector('.tag-remove').addEventListener('click', () => {
        currentTags.splice(i, 1);
        renderModalTags();
      });
      tagInputWrapper.insertBefore(chip, tagInput);
    });
  }

  // ── Filtering, sorting, rendering ──
  function getFilteredNotes() {
    let notes = [...allNotes];

    // Folder filter
    if (activeFolder !== 'all') {
      notes = notes.filter(n => n.folder_id === activeFolder);
    }

    // Tag filter
    if (activeTagFilter) {
      notes = notes.filter(n => (n.tags || []).includes(activeTagFilter));
    }

    // Search
    if (searchQuery) {
      notes = notes.filter(n =>
        (n.title || '').toLowerCase().includes(searchQuery) ||
        (n.content || '').toLowerCase().includes(searchQuery) ||
        (n.tags || []).some(t => t.toLowerCase().includes(searchQuery))
      );
    }

    // Sort
    const sort = sortSelect.value;
    notes.sort((a, b) => {
      // Pinned always first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      switch (sort) {
        case 'updated_desc': return new Date(b.updated_at) - new Date(a.updated_at);
        case 'created_desc': return new Date(b.created_at) - new Date(a.created_at);
        case 'created_asc': return new Date(a.created_at) - new Date(b.created_at);
        case 'title_asc': return (a.title || '').localeCompare(b.title || '');
        case 'title_desc': return (b.title || '').localeCompare(a.title || '');
        default: return 0;
      }
    });

    return notes;
  }

  function renderFilteredNotes() {
    const notes = getFilteredNotes();
    const countEl = document.getElementById('notes-count');
    if (countEl) countEl.textContent = notes.length ? `(${notes.length})` : '';

    if (notes.length === 0) {
      const msg = searchQuery ? 'No notes matching your search' : 'No notes yet';
      notesGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🗒️</div>
          <p>${msg}</p>
          <span>${searchQuery ? 'Try a different search term.' : 'Tap <strong>+ New Note</strong> to get started.'}</span>
        </div>`;
      return;
    }

    notesGrid.innerHTML = notes.map((note, i) => noteCardHTML(note, i)).join('');
    bindNoteCardEvents(notes);
  }

  function noteCardHTML(note, index) {
    const time = relativeTime(note.updated_at || note.created_at);
    const folder = allFolders.find(f => f.id === note.folder_id);
    const pinnedClass = note.is_pinned ? ' pinned' : '';
    const pinBadge = note.is_pinned ? '<span class="pin-badge">📌</span>' : '';

    const folderBadge = folder
      ? `<div class="note-folder-badge"><span class="folder-dot" style="background:${folder.color}"></span>${MarkdownService.escapeHTML(folder.name)}</div>`
      : '';

    const tagChips = (note.tags || [])
      .map(t => `<span class="tag-chip">#${MarkdownService.escapeHTML(t)}</span>`)
      .join('');

    const contentHTML = MarkdownService.render(note.content || '');

    return `
      <div class="note-card${pinnedClass}" data-id="${note.id}" style="animation-delay:${index * 0.05}s">
        ${pinBadge}
        <div class="note-title">${MarkdownService.escapeHTML(note.title || 'Untitled')}</div>
        ${folderBadge}
        ${tagChips ? `<div class="note-tags">${tagChips}</div>` : ''}
        <div class="note-content-preview">${contentHTML}</div>
        <div class="note-meta">
          <span class="note-date">${time}</span>
          <div class="note-actions">
            <button class="btn btn-sm btn-ghost btn-pin" title="${note.is_pinned ? 'Unpin' : 'Pin'}">${note.is_pinned ? '📌' : '📍'}</button>
            <button class="btn btn-sm btn-ghost btn-edit" title="Edit">✏️</button>
            <button class="btn btn-sm btn-danger btn-delete" title="Delete">🗑️</button>
          </div>
        </div>
      </div>`;
  }

  function bindNoteCardEvents(notes) {
    notesGrid.querySelectorAll('.note-card').forEach(card => {
      const id = card.dataset.id;
      const note = notes.find(n => n.id === id);

      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (note) openNoteModal(note);
      });

      card.querySelector('.btn-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        if (note) openNoteModal(note);
      });

      card.querySelector('.btn-pin').addEventListener('click', async (e) => {
        e.stopPropagation();
        const { error } = await NotesService.updateNote(id, { is_pinned: !note.is_pinned });
        if (error) { showToast('Pin failed', 'error'); return; }
        await loadNotes();
      });

      card.querySelector('.btn-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this note?')) return;
        const { error } = await NotesService.deleteNote(id);
        if (error) { showToast('Delete failed', 'error'); return; }
        showToast('Note deleted', 'success');
        await loadNotes();
      });
    });
  }

  // ── Note modal ──
  function openNoteModal(note = null) {
    editingNoteId = note ? note.id : null;
    modalTitle.textContent = note ? 'Edit Note' : 'New Note';
    noteTitleInput.value = note ? note.title : '';
    noteContentInput.value = note ? note.content : '';
    notePinInput.checked = note ? note.is_pinned : false;
    noteFolderSelect.value = note?.folder_id || '';
    currentTags = note ? [...(note.tags || [])] : [];
    renderModalTags();

    lastSavedData = note ? { title: note.title, content: note.content } : null;
    autosaveStatus.classList.add('hidden');

    // Show auto-save indicator only when editing
    if (note) autosaveStatus.classList.remove('hidden');

    noteModal.classList.add('active');
    noteTitleInput.focus();
  }

  function closeNoteModal() {
    noteModal.classList.remove('active');
    noteForm.reset();
    currentTags = [];
    renderModalTags();
    editingNoteId = null;
    clearTimeout(autoSaveTimer);
    autosaveStatus.classList.add('hidden');
  }

  async function handleNoteSave(e) {
    e.preventDefault();
    const title = noteTitleInput.value.trim();
    const content = noteContentInput.value.trim();
    if (!title) { showToast('Title is required', 'error'); return; }

    const saveBtn = $('#modal-save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>';

    const fields = {
      title, content,
      is_pinned: notePinInput.checked,
      tags: currentTags,
      folder_id: noteFolderSelect.value || null,
    };

    let result;
    if (editingNoteId) {
      result = await NotesService.updateNote(editingNoteId, fields);
    } else {
      result = await NotesService.createNote(title, content, fields);
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';

    if (result.error) { showToast(result.error.message, 'error'); return; }

    showToast(editingNoteId ? 'Note updated' : 'Note created', 'success');
    closeNoteModal();
    await loadNotes();
    updateFolderCounts();
  }

  // ── Auto-save ──
  async function autoSave() {
    if (!editingNoteId) return; // only auto-save on existing notes
    const title = noteTitleInput.value.trim();
    const content = noteContentInput.value.trim();
    if (!title) return;

    // Check if data actually changed
    if (lastSavedData && lastSavedData.title === title && lastSavedData.content === content) return;

    autosaveStatus.textContent = 'Saving…';
    autosaveStatus.className = 'autosave-status saving';
    autosaveStatus.classList.remove('hidden');

    const { error } = await NotesService.updateNote(editingNoteId, {
      title, content,
      is_pinned: notePinInput.checked,
      tags: currentTags,
      folder_id: noteFolderSelect.value || null,
    });

    if (error) {
      autosaveStatus.textContent = 'Save failed';
      autosaveStatus.className = 'autosave-status error';
    } else {
      autosaveStatus.textContent = 'Saved ✓';
      autosaveStatus.className = 'autosave-status saved';
      lastSavedData = { title, content };
      // Refresh notes data silently
      const { data } = await NotesService.fetchNotes();
      if (data) { allNotes = data; collectAllTags(); updateFolderCounts(); }
    }
  }

  // ── Folder modal ──
  function openFolderModal(folder = null) {
    editingFolderId = folder ? folder.id : null;
    folderModalTitle.textContent = folder ? 'Edit Folder' : 'New Folder';
    folderNameInput.value = folder ? folder.name : '';
    selectedFolderColor = folder ? folder.color : '#6c63ff';
    folderColorPicker.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === selectedFolderColor);
    });
    folderModal.classList.add('active');
    folderNameInput.focus();
  }

  function closeFolderModal() {
    folderModal.classList.remove('active');
    folderForm.reset();
    editingFolderId = null;
  }

  async function handleFolderSave(e) {
    e.preventDefault();
    const name = folderNameInput.value.trim();
    if (!name) { showToast('Folder name is required', 'error'); return; }

    let result;
    if (editingFolderId) {
      result = await FoldersService.updateFolder(editingFolderId, name, selectedFolderColor);
    } else {
      result = await FoldersService.createFolder(name, selectedFolderColor);
    }

    if (result.error) { showToast(result.error.message, 'error'); return; }
    showToast(editingFolderId ? 'Folder updated' : 'Folder created', 'success');
    closeFolderModal();
    await loadFolders();
  }

  // ── Toast ──
  function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = type;
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  // ── PWA ──
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        console.log('[PWA] Service worker registered', reg.scope);
      }).catch((err) => {
        console.log('[PWA] SW registration failed:', err);
      });
    }
  }

  return { init };
})();

/* ──────────────────────────────────────────────
   Boot
   ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  UIController.init();
});
