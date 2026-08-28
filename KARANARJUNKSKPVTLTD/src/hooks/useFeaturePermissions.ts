import { useAuth } from '../contexts/AuthContext';

/**
 * Returns a checker function for granular feature-level permissions.
 * Usage: const can = useFeaturePermissions(); then can('worklist.partners.view')
 *
 * Admin role bypasses all feature permission checks (same as module-level behavior).
 * Defaults to false for unknown roles or unconfigured permission IDs.
 */
export function useFeaturePermissions(): (permId: string) => boolean {
    const { userRole, featurePermissions } = useAuth();

    return (permId: string): boolean => {
        if (!userRole) return false;
        if (userRole === 'admin') return true;
        return featurePermissions?.[userRole]?.[permId] ?? false;
    };
}
