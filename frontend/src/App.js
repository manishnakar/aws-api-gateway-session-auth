import React, { useState } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || 'https://YOUR_API_GATEWAY_ENDPOINT';

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState(null);
  const [msg, setMsg] = useState('');

  async function login(e) {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // important so browser stores HttpOnly cookie
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      setMsg('Logged in as ' + data.username);
    } else {
      setMsg('Login failed: ' + (data.error || res.status));
    }
  }

  async function getProfile() {
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: 'GET',
      credentials: 'include' // sends cookie automatically
    });
    const data = await res.json();
    if (res.ok) setProfile(data);
    else setMsg('Profile error: ' + (data.error || res.status));
  }

  async function logout() {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    setMsg('Logged out');
    setProfile(null);
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Login</h2>
      <form onSubmit={login}>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" /><br/>
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="password" type="password"/><br/>
        <button type="submit">Log in</button>
      </form>
      <div style={{ marginTop: 12 }}>
        <button onClick={getProfile}>Get Profile</button>
        <button onClick={logout}>Logout</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>{msg}</strong>
        {profile && <pre>{JSON.stringify(profile, null, 2)}</pre>}
      </div>
    </div>
  );
}

export default App;
