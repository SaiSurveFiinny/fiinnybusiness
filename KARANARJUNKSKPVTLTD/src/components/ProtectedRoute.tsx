import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole, AppScreen } from '../contexts/AuthContext';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requireAdmin?: boolean;
    requireRole?: UserRole[];
    appScreen?: AppScreen;
}

export default function ProtectedRoute({ children, requireAdmin = false, requireRole, appScreen }: ProtectedRouteProps) {
    const { currentUser, userRole, permissions, loading } = useAuth();

    // DEMO MODE — bypass auth for local preview
    if (import.meta.env.DEV) return <>{children}</>;

    if (loading) {
        return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Verifying access...</div>;
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    if (requireAdmin && userRole !== 'admin') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h2>Access Denied</h2>
                <p>You do not have permission to view this page. Only Admins can access this area.</p>
            </div>
        );
    }

    if (requireRole && requireRole.length > 0 && !requireRole.includes(userRole as UserRole)) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h2>Access Denied</h2>
                <p>Your account does not have access to this area.</p>
            </div>
        );
    }

    if (appScreen && userRole && permissions) {
        if (!permissions[userRole]?.[appScreen]) {
            return (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                    <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                    <h2>Access Denied</h2>
                    <p>Your role ({userRole}) does not have permission to view the {appScreen.replace('_', ' ')} screen.</p>
                </div>
            );
        }
    }

    return <>{children}</>;
}
