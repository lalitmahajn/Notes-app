/**
 * Helpers — Utility functions
 */

/**
 * Ensure a timestamp string is parsed as UTC.
 * Supabase returns timestamptz as "2026-03-02T05:35:00" without a "Z" or
 * "+00:00" suffix. JavaScript's Date() treats such strings as LOCAL time,
 * which causes wrong relative-time calculations in non-UTC timezones.
 * This helper appends "Z" if no timezone indicator is present.
 */
function toUTC(dateStr) {
    if (!dateStr) return dateStr;
    const s = String(dateStr).trim();
    // Already has timezone info (Z, +HH:MM, -HH:MM, +HHMM, -HHMM)
    if (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)) return s;
    return s + 'Z';
}

function relativeTime(dateStr) {
    const now = Date.now();
    const then = new Date(toUTC(dateStr)).getTime();
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
    return new Date(toUTC(dateStr)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Generate a temporary local UUID for notes created offline */
function generateLocalId() {
    return 'local_' + crypto.randomUUID();
}
