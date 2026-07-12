import React, { useState } from 'react';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { loginAdmin } from '../lib/firebase';

interface Props {
  onLogin: () => void;
}

function friendlyAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/invalid-api-key':
      return 'Firebase is not configured correctly. Check your environment variables.';
    default:
      return 'Unable to sign in. Please try again.';
  }
}

export default function AdminLogin({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginAdmin(email.trim(), password);
      onLogin();
    } catch (err: any) {
      console.error('Admin login failed:', err);
      setError(friendlyAuthError(err?.code || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center p-4 z-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-xl w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Lock className="w-12 h-12 text-zinc-900" />
        </div>
        <h2 className="text-xl font-serif text-center mb-2">Admin Access</h2>
        <p className="text-center text-zinc-500 text-xs mb-6">Sign in with your Firebase admin account</p>

        <div className="space-y-3 mb-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Admin email"
            autoComplete="username"
            className="w-full px-4 py-2 border border-zinc-300 rounded text-sm"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full px-4 py-2 border border-zinc-300 rounded text-sm"
            required
          />
        </div>

        {error && (
          <div className="flex items-start gap-1.5 text-red-600 text-xs mb-4 bg-red-50 border border-red-200 rounded p-2.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-black text-white rounded font-bold uppercase tracking-wider text-xs hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing In...
            </>
          ) : (
            'Unlock Panel'
          )}
        </button>
      </form>
    </div>
  );
}
