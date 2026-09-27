import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactElement;
  /** If set, the route also requires this permission (e.g. "Administration.View") —
   *  UX only, the backend independently rejects any API call the user isn't
   *  actually authorized for regardless of this check. */
  requiredPermission?: string;
}

export default function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, can } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg text-ink-secondary text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2 text-brand-600 dark:text-brand-400" />
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !can(requiredPermission)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="h-12 w-12 rounded-2xl bg-danger-bg text-danger flex items-center justify-center mb-4">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold text-ink-primary mb-1.5">Not authorized</h1>
        <p className="text-ink-secondary text-sm">You don't have permission to view this page.</p>
      </div>
    );
  }

  return children;
}
