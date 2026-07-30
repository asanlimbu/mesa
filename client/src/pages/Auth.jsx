/**
 * Sign in and registration.
 *
 * One shell, two forms — they share layout, error handling and the demo
 * credentials panel.
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '../lib/api.js';
import { useAuth } from '../state/auth.jsx';
import { useToast } from '../state/toast.jsx';
import { Button, ErrorNote, TextField } from '../components/ui.jsx';

function AuthShell({ title, lede, children, footer }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-4xl text-linen">{title}</h1>
      <p className="mt-2 text-sage">{lede}</p>

      <div className="mt-8">{children}</div>

      <p className="mt-6 text-center text-sm text-sage">{footer}</p>
    </div>
  );
}

/** Seeded accounts, so the app can be tried without registering. */
function DemoAccounts({ onUse }) {
  const accounts = [
    { role: 'Diner', email: 'asan@example.com' },
    { role: 'Manager', email: 'elena@copperhearth.test' },
  ];

  return (
    <div className="mt-8 rounded-plate border border-sage/20 bg-banquette/30 p-4">
      <p className="font-mono text-[10px] tracking-[0.16em] text-sage uppercase">
        Demo accounts
      </p>
      <ul className="mt-3 space-y-2">
        {accounts.map((account) => (
          <li key={account.email} className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-xs">
              <span className="text-sage-dim">{account.role}</span>{' '}
              <span className="truncate font-mono text-linen">{account.email}</span>
            </span>
            <button
              type="button"
              onClick={() => onUse(account.email)}
              className="shrink-0 text-xs text-brass underline-offset-4 hover:underline"
            >
              Use
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[11px] text-sage-dim">password123</p>
    </div>
  );
}

export function SignIn() {
  const { signIn } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFields({});
    setBusy(true);

    try {
      const user = await signIn({ email, password });
      notify(`Signed in as ${user.name}.`);
      navigate(
        location.state?.from ?? (user.role === 'MANAGER' ? '/manager' : '/restaurants'),
      );
    } catch (requestError) {
      setError(requestError.message);
      if (requestError instanceof ApiError && requestError.details?.fields) {
        setFields(requestError.details.fields);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      lede="Book tables and manage your reservations."
      footer={
        <>
          No account?{' '}
          <Link to="/register" className="text-brass hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={fields.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          error={fields.password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" busy={busy} className="w-full">
          Sign in
        </Button>
      </form>

      <DemoAccounts
        onUse={(demoEmail) => {
          setEmail(demoEmail);
          setPassword('password123');
        }}
      />
    </AuthShell>
  );
}

export function Register() {
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFields({});
    setBusy(true);

    try {
      const user = await register(form);
      notify(`Welcome, ${user.name}.`);
      navigate('/restaurants');
    } catch (requestError) {
      setError(requestError.message);
      if (requestError instanceof ApiError && requestError.details?.fields) {
        setFields(requestError.details.fields);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      lede="Takes a moment. You only need it to hold a table."
      footer={
        <>
          Already have one?{' '}
          <Link to="/sign-in" className="text-brass hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Name"
          autoComplete="name"
          required
          value={form.name}
          error={fields.name}
          onChange={update('name')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          error={fields.email}
          onChange={update('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          error={fields.password}
          hint="At least 8 characters."
          onChange={update('password')}
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
