import React, { createContext, useContext, useEffect, useState } from 'react';
import { login as loginApi, logout as logoutApi, getMe } from '../api/auth';

interface AuthUser {
  username: string;
  role: string;
  /// SAP B1 company code the user is currently authenticated against, e.g. "STEST".
  company: string;
  companyName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (companyDb: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
  /// True if the current user's role has the given permission key (e.g.
  /// "Purchase.Create"), or if they're the portal superuser. Resolved from
  /// GET /api/auth/me — the backend re-checks independently on every request,
  /// this is for hiding/showing UI only.
  can: (permissionKey: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Only the JWT and safe display fields (username/role/company code+name) ever
// touch localStorage. The SAP B1 password is never stored anywhere on the
// client — it exists only for the moment it takes to submit the login form.
const TOKEN_KEY = 'sapb1_token';
const USER_KEY = 'sapb1_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  async function loadPermissions() {
    try {
      const me = await getMe();
      setIsSuperUser(me.isSuperUser);
      setPermissions(new Set(me.permissions));
    } catch {
      // Non-fatal — can() just returns false for everything until a retry
      // (e.g. next login) succeeds; the backend still enforces independently.
      setIsSuperUser(false);
      setPermissions(new Set());
    }
  }

  useEffect(() => {
    (async () => {
      const storedUser = localStorage.getItem(USER_KEY);
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser));
        await loadPermissions();
      }
      setIsLoading(false);
    })();
  }, []);

  async function login(companyDb: string, username: string, password: string) {
    const response = await loginApi(companyDb, username, password);
    localStorage.setItem(TOKEN_KEY, response.token);
    const authUser: AuthUser = {
      username: response.username,
      role: response.role,
      company: response.company,
      companyName: response.companyName
    };
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setUser(authUser);
    await loadPermissions();
  }

  async function logout() {
    try {
      // Best-effort: revoke the token server-side immediately. If this fails
      // (e.g. the token already expired, or the network is down), local
      // auth state is cleared anyway — the important part client-side is
      // that this browser forgets the token and shows the login screen.
      await logoutApi();
    } catch {
      // Intentionally ignored — see comment above.
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
      setIsSuperUser(false);
      setPermissions(new Set());
    }
  }

  function hasRole(...roles: string[]) {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    return roles.includes(user.role);
  }

  function can(permissionKey: string) {
    if (!user) return false;
    if (isSuperUser) return true;
    return permissions.has(permissionKey);
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, hasRole, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
