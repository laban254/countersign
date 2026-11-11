export const ADMIN_TOKEN_KEY = 'countersign_admin_token';

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // sessionStorage can be unavailable in hardened browser contexts.
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Fetch wrapper for dashboard requests. It attaches the admin bearer token
 * when one is present and signals the app when the session is rejected.
 *
 * Agent requests are excluded: the simulator supplies its own agent token.
 */
export type DashboardRole = 'admin' | 'judge';
const ROLE_KEY = 'countersign_role';

export function setDashboardRole(role: DashboardRole): void {
  try {
    sessionStorage.setItem(ROLE_KEY, role);
  } catch {
    // ignore
  }
}

/** Defaults to admin: the role only restricts a few actions in public demo mode. */
export function getDashboardRole(): DashboardRole {
  try {
    return sessionStorage.getItem(ROLE_KEY) === 'judge' ? 'judge' : 'admin';
  } catch {
    return 'admin';
  }
}

export const DEMO_RESTRICTED_HINT = 'Not available in the public demo';

/** Show a toast from anywhere; App listens for this event. */
export function notify(message: string, kind: 'info' | 'error' = 'info'): void {
  window.dispatchEvent(new CustomEvent('countersign:toast', { detail: { message, kind } }));
}

/** Read an error message from a failed API response. */
export async function responseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.clone().json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const url = String(input);
  const isAgentRequest = url.startsWith('/api/v1/agent/');
  const isAuthRequest = url.startsWith('/api/v1/auth/');
  const headers = new Headers(init.headers);
  const token = getAdminToken();

  if (token && !isAgentRequest && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 403 && !isAgentRequest) {
    response
      .clone()
      .json()
      .then((body) => {
        if (body?.code === 'DEMO_RESTRICTED') notify(DEMO_RESTRICTED_HINT, 'error');
      })
      .catch(() => undefined);
  }

  if (response.status === 401 && !isAgentRequest && !isAuthRequest) {
    window.dispatchEvent(new Event('countersign:unauthorized'));
  }

  return response;
}

export interface DemoAccess {
  enabled: boolean;
  token?: string;
  agentToken?: string | null;
}

/** Ask the server whether public demo mode is on and, if so, for the judge credentials. */
export async function fetchDemoAccess(): Promise<DemoAccess> {
  try {
    const res = await fetch('/api/v1/auth/demo');
    if (!res.ok) return { enabled: false };
    return (await res.json()) as DemoAccess;
  } catch {
    return { enabled: false };
  }
}

const ENTERED_KEY = 'countersign_entered';

export function hasEnteredConsole(): boolean {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Forget the console session (role and "entered" flag); the caller clears the token. */
export function clearConsoleSession(): void {
  try {
    sessionStorage.removeItem(ENTERED_KEY);
    sessionStorage.removeItem(ROLE_KEY);
  } catch {
    // ignore
  }
}

export function markEnteredConsole(): void {
  try {
    sessionStorage.setItem(ENTERED_KEY, '1');
  } catch {
    // ignore
  }
}
