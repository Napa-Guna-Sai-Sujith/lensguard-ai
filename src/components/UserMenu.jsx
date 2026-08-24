import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative border-l pl-3" style={{ borderColor: 'var(--line)' }} ref={menuRef}>
      {/* Profile Icon Avatar Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        title="Account options"
        aria-label="Account options"
        className="flex items-center gap-2 rounded-full p-1 transition-all hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.name}
            className="h-8 w-8 rounded-full object-cover ring-2 ring-emerald-500/40"
          />
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-sm"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {user.name?.[0]?.toUpperCase() || 'U'}
          </div>
        )}
        <svg
          className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 rounded-2xl border p-2 shadow-2xl z-50 themed"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--line)' }}
          >
            {/* User Profile Header */}
            <div className="border-b px-3 py-2.5 mb-1" style={{ borderColor: 'var(--line)' }}>
              <p className="text-xs font-bold truncate">{user.name || 'LensGuard User'}</p>
              <p className="text-[11px] truncate opacity-70" style={{ color: 'var(--txt2)' }}>
                {user.email}
              </p>
            </div>

            {/* Menu Actions */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium opacity-80 cursor-default">
                <span className="text-sm">👤</span>
                <span>Profile (Active)</span>
              </div>

              <button
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors hover:bg-rose-500/10 text-rose-500 text-left"
              >
                <span className="text-sm">🚪</span>
                <span>Logout</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
