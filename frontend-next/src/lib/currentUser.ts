import api from './api';

/**
 * The signed-in user, cached in localStorage.
 *
 * The cache is written once at login and was never refreshed, so anything a
 * person changed about themselves — their display name, their photo — kept
 * showing the old value in the top bar until they logged out and back in.
 * Every write here also announces itself, so whatever is on screen updates
 * without a reload.
 */
export interface CurrentUser {
  id: number;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

const KEY = 'user';
export const USER_UPDATED = 'ontask:user-updated';

export function getCachedUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user: CurrentUser): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // A full or blocked store is not a reason to fail the save that just
    // succeeded on the server; the next load will fetch it again.
  }
  window.dispatchEvent(new CustomEvent<CurrentUser>(USER_UPDATED, { detail: user }));
}

/** Pull the authoritative record and refresh the cache from it. */
export async function refreshCurrentUser(): Promise<CurrentUser | null> {
  try {
    const { data } = await api.get('/users/me');
    setCachedUser(data);
    return data;
  } catch {
    return null;
  }
}

/** The name to show: what the person chose, else their full name. */
export function displayNameOf(u: { displayName?: string | null; firstName?: string; lastName?: string }): string {
  return u.displayName?.trim() || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
}
