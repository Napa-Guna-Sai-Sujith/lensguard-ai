import { useState } from 'react';
import { motion } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useTheme } from '../lib/useTheme.js';
import ThemeToggle from './ThemeToggle.jsx';

export default function AuthPage({ onAuthSuccess }) {
  const { theme, toggle } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin ? { email, password } : { name, email, password };

    try {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('lensguard_token', data.token);
      localStorage.setItem('lensguard_user', JSON.stringify(data.user));
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const decoded = jwtDecode(credentialResponse.credential);
      const res = await fetch(`${apiBase}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleToken: credentialResponse.credential,
          payload: decoded
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Google login failed');

      localStorage.setItem('lensguard_token', data.token);
      localStorage.setItem('lensguard_user', JSON.stringify(data.user));
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ backgroundColor: 'var(--field)' }}>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-2xl border p-6 sm:p-8 shadow-xl themed"
        style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--line)' }}
      >
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>

        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-md"
               style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}>
            👁️
          </div>
          <h1 className="text-xl font-bold">LensGuard AI</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--txt2)' }}>
            On-device real-time camera health monitor
          </p>
        </div>

        <div className="flex rounded-xl border p-0.5 mb-5 themed" style={{ borderColor: 'var(--line)' }}>
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${isLogin ? 'shadow-sm' : ''}`}
            style={{
              backgroundColor: isLogin ? 'var(--pill)' : 'transparent',
              color: isLogin ? 'var(--pill-txt)' : 'var(--txt2)'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${!isLogin ? 'shadow-sm' : ''}`}
            style={{
              backgroundColor: !isLogin ? 'var(--pill)' : 'transparent',
              color: !isLogin ? 'var(--pill-txt)' : 'var(--txt2)'
            }}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--txt2)' }}>Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--line)' }}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--txt2)' }}>Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--line)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--txt2)' }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--line)' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl py-3 text-sm font-bold transition-all hover:opacity-90 active:scale-[0.99] mt-2 shadow-sm"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {loading ? 'Authenticating...' : isLogin ? 'Sign In to Dashboard' : 'Create & Continue'}
          </button>
        </form>

        <div className="relative my-5 flex items-center justify-center">
          <div className="absolute inset-0 border-t" style={{ borderColor: 'var(--line)' }} />
          <span className="relative px-3 text-[11px] font-medium" style={{ backgroundColor: 'var(--bg)', color: 'var(--txt2)' }}>
            OR CONTINUE WITH
          </span>
        </div>

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google Sign-In failed')}
            shape="pill"
            theme="outline"
          />
        </div>
      </motion.div>
    </div>
  );
}
