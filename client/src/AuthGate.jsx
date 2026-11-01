import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Eye, EyeOff, Fingerprint, LockKeyhole, Mail, Moon, ShieldCheck, Sun, Waves, Zap } from 'lucide-react';
import App from './App.jsx';

const THEMES = [
  { id: 'obsidian', label: 'Obsidian', color: '#baff39', icon: Moon },
  { id: 'paper', label: 'Paper', color: '#3157e8', icon: Sun },
  { id: 'ultraviolet', label: 'Ultraviolet', color: '#a78bfa', icon: Zap },
  { id: 'ocean', label: 'Ocean', color: '#38c7d9', icon: Waves },
  { id: 'ember', label: 'Ember', color: '#ff855e', icon: Activity }
];

function setTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem('traceguard_theme', id);
}

export default function AuthGate() {
  const [token, setToken] = useState(() => localStorage.getItem('traceguard_token') || '');
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [theme, setThemeState] = useState(() => localStorage.getItem('traceguard_theme') || 'obsidian');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [themeMenu, setThemeMenu] = useState(false);

  useEffect(() => { setTheme(theme); }, [theme]);
  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Session expired'); return d; })
      .then(d => setUser(d.user))
      .catch(() => { localStorage.removeItem('traceguard_token'); setToken(''); setUser(null); });
  }, [token]);

  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Authentication failed');
      localStorage.setItem('traceguard_token', data.token);
      setToken(data.token); setUser(data.user); setNotice('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const logout = () => {
    localStorage.removeItem('traceguard_token');
    setToken(''); setUser(null); setPassword(''); setMode('login');
  };

  const ThemePicker = () => <div className="tg-theme-wrap">
    <button className="tg-theme-trigger" onClick={() => setThemeMenu(v => !v)} aria-label="Choose color theme">
      <span className="tg-theme-dots">{THEMES.map(t => <i key={t.id} style={{ background: t.color }} />)}</span>
      <span>THEME</span><b>＋</b>
    </button>
    {themeMenu && <div className="tg-theme-menu"><div className="tg-theme-menu-label">COLOR SYSTEM</div>{THEMES.map(t => {
      const Icon = t.icon;
      return <button key={t.id} className={`tg-theme-option ${theme === t.id ? 'selected' : ''}`} onClick={() => { setThemeState(t.id); setThemeMenu(false); }}>
        <span className="tg-theme-color" style={{ background: t.color }}><Icon size={14}/></span><span>{t.label}</span>{theme === t.id && <b>ACTIVE</b>}
      </button>;
    })}</div>}
  </div>;

  if (token && !user) return <div className="tg-auth-loading"><span className="tg-loader"/><span>Restoring secure session</span><ThemePicker /></div>;
  if (user) return <><App user={user} onLogout={logout} /><div className="tg-session-tools"><span className="tg-session-user"><i/> {user.name || user.email}</span><ThemePicker /><button className="tg-logout" onClick={logout}>Sign out ↗</button></div></>;

  return <div className="tg-auth-screen">
    <div className="tg-auth-grid" aria-hidden="true"/><div className="tg-auth-glow tg-glow-a"/><div className="tg-auth-glow tg-glow-b"/>
    <header className="tg-auth-header"><a className="tg-wordmark" href="#"><span className="tg-logo-mark"><Fingerprint size={21}/></span><span>traceguard<span className="tg-wordmark-dot">.</span><small>SUPPLY NETWORK INTELLIGENCE</small></span></a><div className="tg-auth-header-right"><span><i/> SYSTEMS NOMINAL</span><ThemePicker /></div></header>
    <main className="tg-auth-layout">
      <section className="tg-auth-story">
        <div className="tg-auth-kicker"><span/> TRACEABILITY / RISK / RESPONSE</div>
        <h1>Every movement.<br/><em>Accounted for.</em></h1>
        <p>A sharper view of your supply chain. Trace product journeys, surface risk early, and make recall decisions with confidence.</p>
        <div className="tg-signal-visual">
          <div className="tg-signal-ring ring-1"/><div className="tg-signal-ring ring-2"/><div className="tg-signal-ring ring-3"/>
          <div className="tg-signal-core"><ShieldCheck size={30}/><span>TRACE<br/>SECURE</span></div>
          <span className="tg-signal-node sn-1"><Activity size={16}/></span><span className="tg-signal-node sn-2"><Waves size={16}/></span><span className="tg-signal-node sn-3"><Zap size={16}/></span>
          <span className="tg-signal-label sl-1">ORIGIN NODE</span><span className="tg-signal-label sl-2">LIVE TELEMETRY</span>
        </div>
        <div className="tg-auth-footnotes"><span><b>01</b> FULL TRACEABILITY</span><span><b>02</b> RECALL INTELLIGENCE</span><span><b>03</b> AUDITABLE ACTIONS</span></div>
      </section>
      <section className="tg-auth-card">
        <div className="tg-card-index"><span>IDENTITY GATE / 00{mode === 'login' ? '1' : '2'}</span><span className="tg-secure-label"><LockKeyhole size={12}/> ENCRYPTED SESSION</span></div>
        <div className="tg-card-title"><div className="tg-card-symbol"><ShieldCheck size={22}/></div><div><div className="tg-overline">{mode === 'login' ? 'WELCOME BACK' : 'CREATE YOUR ACCESS'}</div><h2>{mode === 'login' ? 'Enter the network.' : 'Build your access.'}</h2></div></div>
        <p className="tg-card-description">{mode === 'login' ? 'Sign in to continue to your command center.' : 'Create a workspace identity to access TraceGuard.'}</p>
        <form className="tg-auth-form" onSubmit={submit}>
          {mode === 'register' && <label className="tg-field"><span>DISPLAY NAME</span><div><Fingerprint size={16}/><input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" minLength={2} maxLength={80} required/></div></label>}
          <label className="tg-field"><span>WORK EMAIL</span><div><Mail size={16}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" maxLength={190} required/></div></label>
          <label className="tg-field"><span>PASSWORD <small>{mode === 'register' ? 'MINIMUM 10 CHARACTERS' : 'YOUR ACCESS KEY'}</small></span><div><LockKeyhole size={16}/><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" minLength={mode === 'register' ? 10 : 1} required/><button type="button" className="tg-eye" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
          {error && <div className="tg-auth-error">{error}</div>}
          <button className="tg-submit" disabled={busy}>{busy ? 'VERIFYING CREDENTIALS…' : mode === 'login' ? 'Enter command center' : 'Create account'} <ArrowRight size={17}/></button>
        </form>
        <div className="tg-auth-switch">{mode === 'login' ? 'New to the network?' : 'Already have access?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></div>
        <div className="tg-card-security"><span><LockKeyhole size={13}/> PASSWORDS HASHED SERVER-SIDE</span><span>TRACEGUARD / ACCESS CONTROL</span></div>
      </section>
    </main>
    <footer className="tg-auth-footer"><span>TRACEGUARD <b>IDENTITY SYSTEM</b></span><span>BUILT FOR VISIBILITY. DESIGNED FOR ACTION. <i>●</i></span></footer>
  </div>;
}
