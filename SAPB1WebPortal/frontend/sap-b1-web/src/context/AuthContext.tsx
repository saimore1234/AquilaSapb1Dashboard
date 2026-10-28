import React, { createContext, useContext, useEffect, useState } from 'react';
import { login as loginApi, logout as logoutApi, getMe, changePassword as changePasswordApi } from '../api/auth';
import { buildAccess, canAccessPath, emptyAccess, hasPermission as evaluate, type AccessSnapshot } from '../permissions/evaluate';
import { session } from '../native/session';
import type { SalesScope } from '../types';

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
  /// true while the account still has a temporary password: the app shows only the "set a new password" screen.
  mustChangePassword: boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
  /// True if the current user's role has the given permission key (e.g.
  /// "Purchase.Create"), or if they're the portal superuser. Resolved from
  /// GET /api/auth/me — the backend re-checks independently on every request,
  /// this is for hiding/showing UI only.
  can: (permissionKey: string) => boolean;
  /// Central permission service — every UI permission check goes through these.
  /// Backed by the same rules the server enforces (see permissions/evaluate.ts).
  access: AccessSnapshot;
  /// Which SAP salespersons this login is limited to (null for unrestricted logins). Informational — the server enforces it.
  salesScope: SalesScope | null;
  hasPermission: (moduleKey: string, pageKey: string | null | undefined, action: string) => boolean;
  canView: (moduleKey: string, pageKey?: string | null) => boolean;
  canCreate: (moduleKey: string, pageKey?: string | null) => boolean;
  canEdit: (moduleKey: string, pageKey?: string | null) => boolean;
  canDelete: (moduleKey: string, pageKey?: string | null) => boolean;
  canExport: (moduleKey: string, pageKey?: string | null) => boolean;
  canApprove: (moduleKey: string, pageKey?: string | null) => boolean;
  /// Route-level check resolved through the navigation registry.
  canAccessPath: (pathname: string, action?: string) => boolean;
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
  const [access, setAccess] = useState<AccessSnapshot>(emptyAccess());
  const [salesScope, setSalesScope] = useState<SalesScope | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  async function loadPermissions() {
    try {
      const me = await getMe();
      setAccess(buildAccess(me.isSuperUser, me.permissions, me.pageRules ?? {}));
      setSalesScope(me.salesScope ?? null);
      setMustChangePassword(!!me.mustChangePassword);
    } catch {
      // Non-fatal — can() just returns false for everything until a retry
      // (e.g. next login) succeeds; the backend still enforces independently.
      setAccess(emptyAccess());
      setSalesScope(null);
    }
  }

  useEffect(() => {
    (async () => {
      const storedUser = session.get(USER_KEY);
      const storedToken = session.get(TOKEN_KEY);
      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser));
        await loadPermissions();
      }
      setIsLoading(false);
    })();
  }, []);

  async function login(companyDb: string, username: string, password: string) {
    const response = await loginApi(companyDb, username, password);
    session.set(TOKEN_KEY, response.token);
    const authUser: AuthUser = {
      username: response.username,
      role: response.role,
      company: response.company,
      companyName: response.companyName
    };
    session.set(USER_KEY, JSON.stringify(authUser));
    // Permissions first, so route guards never see an authenticated user with an empty set.
    await loadPermissions();
    setMustChangePassword(!!response.mustChangePassword);
    setUser(authUser);
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const response = await changePasswordApi(currentPassword, newPassword);
    session.set(TOKEN_KEY, response.token); // the old token was revoked by the server
    await loadPermissions();
    setMustChangePassword(false);
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
      session.remove(TOKEN_KEY);
      session.remove(USER_KEY);
      setUser(null);
      setAccess(emptyAccess());
      setSalesScope(null);
      setMustChangePassword(false);
    }
  }

  function hasRole(...roles: string[]) {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    return roles.includes(user.role);
  }

  const hasPermission = (moduleKey: string, pageKey: string | null | undefined, action: string) =>
    !!user && evaluate(access, moduleKey, pageKey, action);

  /// Legacy "Module.Action" key form (module-level check).
  function can(permissionKey: string) {
    const [moduleKey, action] = permissionKey.split('.');
    return hasPermission(moduleKey, null, action);
  }

  const forAction = (action: string) => (moduleKey: string, pageKey?: string | null) => hasPermission(moduleKey, pageKey, action);

  return (
    <AuthContext.Provider value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        mustChangePassword,
        changePassword,
        hasRole,
        can,
        access,
        salesScope,
        hasPermission,
        canView: forAction('View'),
        canCreate: forAction('Create'),
        canEdit: forAction('Edit'),
        canDelete: forAction('Delete'),
        canExport: forAction('Export'),
        canApprove: forAction('Approve'),
        canAccessPath: (pathname, action) => !!user && canAccessPath(access, pathname, action)
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
