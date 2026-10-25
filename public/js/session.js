// The saved seat: room code, playerId and the secret resumeToken.
//
// Stored in sessionStorage, not localStorage, on purpose: a seat belongs to
// one tab. A second tab in the same browser gets the join screen instead of
// silently stealing the first tab's seat. sessionStorage still survives a
// phone lock/wake and a reload, which is what resume is for.

export const SESSION_KEY = 'vcSession';

export function createSessionStore(storage) {
  return {
    load() {
      try {
        const raw = storage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(session) {
      try {
        storage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        // Blocked storage: resume just won't work on this device.
      }
    },
    clear() {
      try {
        storage.removeItem(SESSION_KEY);
      } catch {
        // ignore
      }
    },
  };
}

// Only the server saying the seat does not exist (or is not ours) should
// throw the seat away. Network trouble keeps it for the next attempt.
export function sessionIsDead(error) {
  return error === 'gone' || error === 'unauthorized';
}
