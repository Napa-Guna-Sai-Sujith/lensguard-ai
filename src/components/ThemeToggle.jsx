import { motion } from 'framer-motion';

/** Animated pill switch. Sun ↔ moon cross-fade, 200ms, keyboard accessible. */
export default function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark';
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={dark}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
      className="relative inline-flex h-9 w-[68px] shrink-0 items-center rounded-full border themed"
      style={{
        borderColor: 'var(--line)',
        backgroundColor: dark ? 'var(--card-2)' : '#e9edf6',
      }}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        className="absolute flex h-7 w-7 items-center justify-center rounded-full text-[13px]"
        style={{
          left: dark ? 34 : 4,
          backgroundColor: 'var(--card)',
          boxShadow: '0 2px 8px rgba(0,0,0,.22)',
        }}
      >
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -35, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {dark ? '🌙' : '☀️'}
        </motion.span>
      </motion.span>
    </button>
  );
}
