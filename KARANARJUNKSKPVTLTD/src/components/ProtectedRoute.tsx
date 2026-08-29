import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole, AppScreen } from '../contexts/AuthContext';

// Mirrors the DEFAULT_LANDING in App.tsx — the built-in fallback when no
// admin-configured landing exists for a role.
const DEFAULT_ROLE_LANDING: Record<string, string> = {
    admin: '/dashboard',
    analyst: '/dashboard',
    shopkeeper: '/pos',
    sales: '/sales-targets',
    retailer: '/worklist',
    manufacturer: '/manufacturer-portal',
};

interface ProtectedRouteProps {
    children: React.ReactNode;
    requireAdmin?: boolean;
    requireRole?: UserRole[];
    appScreen?: AppScreen;
}

/**
 * Route-level access control.
 *
 * Authorization is layered in this order:
 *   1. User must be authenticated.
 *   2. admin role bypasses all subsequent checks.
 *   3. requireAdmin flag → only 'admin' passes (legacy, prefer requireRole).
 *   4. appScreen permission from the live role matrix (Firestore rolePermissions)
 *      → this is the single source of truth and handles custom roles automatically.
 *   5. requireRole list → used as an additional guard for built-in roles. A custom
 *      role NOT in the list is still admitted when its appScreen permission is true.
 *
 * Denied requests are redirected to the user's configured landing page (from
 * roleLandingPages) or the built-in default. Loop prevention: if the landing page
 * equals the current path the fallback is /dashboard.
 *
 * DEV bypass removed intentionally — permissions must be testable in all
 * environments including UAT/staging. Use a real Firebase auth session to test.
 */
export default function ProtectedRoute({ children, requireAdmin = false, requireRole, appScreen }: ProtectedRouteProps) {
    const { currentUser, userRole, permissions, loading, roleLandingPages } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Verifying access…
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    // 'admin' role is unrestricted — bypasses every subsequent check.
    if (userRole === 'admin') return <>{children}</>;

    // Compute the safe redirect for this user. Uses the admin-configured landing
    // page when available, then the built-in default, then /dashboard as last resort.
    const configured = (userRole && roleLandingPages?.[userRole]) || '';
    const builtIn = (userRole && DEFAULT_ROLE_LANDING[userRole]) || '/dashboard';
    const landingPage = configured || builtIn;
    // Prevent redirect loops: if we would redirect to the current path, fall back
    // to /dashboard; if that is also current (shouldn't happen), fall back to /login.
    const safeRedirect =
        location.pathname !== landingPage ? landingPage :
        location.pathname !== '/dashboard' ? '/dashboard' :
        '/login';

    // Legacy requireAdmin flag — non-admin roles are redirected.
    if (requireAdmin) {
        return <Navigate to={safeRedirect} replace />;
    }

    // ── Module-level permission (single source of truth) ──────────────────────
    // Reads the live rolePermissions matrix from Firestore via AuthContext.
    // undefined → not configured for this role → denied (secure by default).
    const screenAllowed =
        !appScreen ||
        (userRole != null && permissions[userRole]?.[appScreen] === true);

    // ── Role list check ───────────────────────────────────────────────────────
    // A custom role will not appear in requireRole (those lists name built-in
    // roles only). Admit any role whose appScreen permission is explicitly true
    // so custom roles work without modifying route definitions.
    const roleAllowed =
        !requireRole ||
        requireRole.length === 0 ||
        requireRole.includes(userRole as UserRole) ||
        screenAllowed; // custom role admitted via screen permission

    if (!roleAllowed || !screenAllowed) {
        return <Navigate to={safeRedirect} replace />;
    }

    return <>{children}</>;
}
