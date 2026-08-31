import { useState } from 'react';
import type { CurrentUserContract } from '@enterprise-brain/contracts';
import type { DesktopApiError, DesktopResult } from '../../../../shared/enterprise-brain.js';

export function LoginScreen({ onLogin }: { onLogin: (input: { login: string; password: string }) => Promise<DesktopResult<CurrentUserContract>> }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DesktopApiError>();
  async function submit() {
    if (busy || !login.trim() || !password) return;
    setBusy(true);
    const result = await onLogin({ login, password });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }
  return <main className="content"><section className="auth-card"><p className="eyebrow">ENTERPRISE BRAIN · DEMO</p><h1>Sign in</h1><label>Login<input value={login} onInput={(event) => setLogin(event.currentTarget.value)} autoComplete="username" /></label><label>Password<input type="password" value={password} onInput={(event) => setPassword(event.currentTarget.value)} autoComplete="current-password" /></label>{error && <p className="result-error">{error.code === 'AUTHENTICATION_REQUIRED' ? 'Invalid login credentials.' : error.message}</p>}<button className="primary" disabled={busy || !login.trim() || !password} onClick={() => void submit()}>{busy ? 'Signing in…' : 'Sign in'}</button></section></main>;
}
