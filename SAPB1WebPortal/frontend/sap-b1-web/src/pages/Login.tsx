import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, ShieldCheck, Building2, ChevronDown, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCompanies } from '../api/auth';
import type { CompanyOption } from '../types';

const REMEMBER_KEY = 'b1_remember';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  const [companyDb, setCompanyDb] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getCompanies();
        if (cancelled) return;
        setCompanies(list);

        let remembered: { companyDb?: string; username?: string } = {};
        try {
          remembered = JSON.parse(localStorage.getItem(REMEMBER_KEY) || '{}');
        } catch {
          remembered = {};
        }

        if (remembered.companyDb && list.some((c) => c.code === remembered.companyDb)) {
          setCompanyDb(remembered.companyDb);
          setRememberMe(true);
        } else if (list.length > 0) {
          setCompanyDb(list[0].code);
        }
        if (remembered.username) setUsername(remembered.username);
      } catch (err: any) {
        if (cancelled) return;
        setCompaniesError(err.message || 'Could not load the company list.');
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAuthenticated) {
    const from = (location.state as { from?: Location })?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyDb) {
      setError('Select a company.');
      return;
    }

    setSubmitting(true);
    try {
      await login(companyDb, username, password);
      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ companyDb, username }));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        // Storage unavailable — non-fatal, login already succeeded.
      }
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Left — branding */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative overflow-hidden bg-brand-950 text-white flex-col justify-between p-12 xl:p-16">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-brand-400/10 blur-3xl" />
          <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
            <defs>
              <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center font-bold text-sm">B1</div>
          <span className="font-semibold text-lg">Business Hub</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative"
        >
          <p className="text-white/50 text-sm font-medium mb-3">Business Management Platform</p>
          <h1 className="text-4xl xl:text-[2.75rem] font-semibold leading-[1.15] mb-6">
            Your business.
            <br />
            One intelligent workspace.
          </h1>
          <p className="text-white/60 text-base max-w-md leading-relaxed">
            A modern companion for SAP Business One — real-time customers, suppliers, items and
            inventory, all in one clean interface across every company you manage.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative flex items-center gap-2 text-white/40 text-xs"
        >
          <ShieldCheck className="h-4 w-4" />
          Official SAP product — a modern companion application for SAP Business One.
        </motion.div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center px-5 py-10 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-8">
            <div className="h-9 w-9 rounded-lg bg-brand-950 text-white flex items-center justify-center font-bold text-sm">B1</div>
            <span className="font-semibold text-lg text-ink-primary">Business Hub</span>
          </div>

          <div className="mb-7">
            <h2 className="text-xl font-semibold text-ink-primary">Sign in</h2>
            <p className="text-ink-secondary text-sm mt-1">Enter your SAP Business One portal credentials.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            {companiesError && (
              <div className="flex items-start gap-2 bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {companiesError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">Company</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-tertiary pointer-events-none" />
                <select
                  className="input-field pl-9 pr-9 appearance-none"
                  value={companyDb}
                  onChange={(e) => setCompanyDb(e.target.value)}
                  disabled={companiesLoading || companies.length === 0}
                  required
                >
                  {companiesLoading && <option value="">Loading companies…</option>}
                  {!companiesLoading && companies.length === 0 && <option value="">No companies configured</option>}
                  {companies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-tertiary pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">Username</label>
              <input
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">Password</label>
              <div className="relative">
                <input
                  className="input-field pr-10"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink-primary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-1">
              <label className="flex items-center gap-2 text-ink-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => setShowForgotHint((s) => !s)}
                className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                Forgot password?
              </button>
            </div>
            {showForgotHint && (
              <p className="text-xs text-ink-tertiary bg-surface-secondary rounded-lg px-3 py-2">
                Contact your system administrator to reset your password.
              </p>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={submitting || companiesLoading}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="flex items-center justify-center gap-1.5 text-xs text-ink-tertiary mt-7">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure enterprise access
          </div>
        </motion.div>
      </div>
    </div>
  );
}
