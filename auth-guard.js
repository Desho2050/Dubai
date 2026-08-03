/* ============================================================
   GISCO Auth Guard - shared session / cache / inactivity protection
   ------------------------------------------------------------
   1) Redirects unauthenticated users to the login page (index.html)
      using location.replace() so protected pages are not kept in
      the browser history.
   2) Auto-logout after X minutes of user inactivity on ALL pages
      (this file is loaded by every protected page).
   3) Handles the browser Back / Forward cache (bfcache): when a
      user presses Back after logout, the browser can restore a
      page from cache without re-running scripts. The 'pageshow'
      event (event.persisted === true) forces a re-auth check.
   4) Provides window.handleLogout() which clears sessionStorage,
      localStorage, and IndexedDB app caches, then navigates to the
      login page with location.replace() (no history entry retained).
   ============================================================ */
(function () {
  'use strict';

  var AUTH_KEY = 'gisAuthenticated';
  var LOGIN_PAGE = 'index.html';

  // ==== INACTIVITY CONFIGURATION ====
  var INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes
  var LAST_ACTIVITY_KEY = 'gis_last_activity';
  var inactivityTimer = null;
  var lastStoragePush = 0;
  var STORAGE_PUSH_INTERVAL = 10000; // persist activity time max every 10s

  function isAuthenticated() {
    try {
      return sessionStorage.getItem(AUTH_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function redirectToLogin() {
    try {
      // location.replace() removes the current page from history so
      // the Back button cannot return to a protected page.
      window.location.replace(LOGIN_PAGE);
    } catch (e) {
      window.location.href = LOGIN_PAGE;
    }
  }

  function checkAuth() {
    if (!isAuthenticated()) {
      try { sessionStorage.removeItem(LAST_ACTIVITY_KEY); } catch (e) { /* ignore */ }
      redirectToLogin();
    }
  }

  // ------------------------------------------------------------
  // INACTIVITY MONITOR
  // ------------------------------------------------------------
  function clearInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  function persistLastActivity() {
    var now = Date.now();
    if (now - lastStoragePush >= STORAGE_PUSH_INTERVAL) {
      lastStoragePush = now;
      try { sessionStorage.setItem(LAST_ACTIVITY_KEY, now.toString()); } catch (e) { /* ignore */ }
    }
  }

  function updateLastActivity() {
    try { sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString()); } catch (e) { /* ignore */ }
    lastStoragePush = Date.now();
  }

  function autoLogout() {
    clearInactivityTimer();
    try { sessionStorage.removeItem(LAST_ACTIVITY_KEY); } catch (e) { /* ignore */ }
    if (typeof window.handleLogout === 'function') {
      window.handleLogout();
    } else {
      redirectToLogin();
    }
  }

  function resetInactivityTimer() {
    clearInactivityTimer();
    updateLastActivity();
    inactivityTimer = setTimeout(autoLogout, INACTIVITY_LIMIT);
  }

  function handleActivity() {
    if (!isAuthenticated()) return;
    clearInactivityTimer();
    persistLastActivity();
    inactivityTimer = setTimeout(autoLogout, INACTIVITY_LIMIT);
  }

  function startInactivityMonitor() {
    if (!isAuthenticated()) return;

    // If a previous page recorded a last-activity time in this session,
    // continue counting so total idle time is continuous across navigations.
    try {
      var last = parseInt(sessionStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
      if (last > 0) {
        var elapsed = Date.now() - last;
        if (elapsed >= INACTIVITY_LIMIT) {
          autoLogout();
          return;
        }
        clearInactivityTimer();
        inactivityTimer = setTimeout(autoLogout, INACTIVITY_LIMIT - elapsed);
        lastStoragePush = last;
      } else {
        resetInactivityTimer();
      }
    } catch (e) {
      resetInactivityTimer();
    }

    // Listen to user activity: mouse, keyboard, scroll, touch, pointer
    var events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'pointerdown', 'wheel'];
    for (var i = 0; i < events.length; i++) {
      document.addEventListener(events[i], handleActivity, { passive: true });
    }

    // If the tab regains focus (user returns to the browser), reset the timer.
    window.addEventListener('focus', function () {
      if (isAuthenticated()) resetInactivityTimer();
    });
  }

  // --- Initial check (runs immediately when the script loads) ---
  checkAuth();
  startInactivityMonitor();

  // --- Back / forward cache (bfcache) protection ---
  // On logout the session is cleared; if the user then presses Back
  // the browser may restore the cached page. 'pageshow' fires with
  // event.persisted === true in that case, so we re-verify auth.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      checkAuth();
    }
  });

  /* ------------------------------------------------------------
     Global logout helper
     Clears sessionStorage, localStorage, and IndexedDB caches,
     then navigates to the login page using location.replace() so
     the protected page is not retained in browser history.
     ------------------------------------------------------------ */
  window.handleLogout = function () {
    clearInactivityTimer();
    try { sessionStorage.removeItem(LAST_ACTIVITY_KEY); } catch (e) { /* ignore */ }

    try {
      // 1) Clear the session (auth token + all session data)
      sessionStorage.clear();
    } catch (e) { /* ignore */ }

    try {
      // 2) Clear all localStorage (theme, language, cached state)
      localStorage.clear();
    } catch (e) { /* ignore */ }

    // 3) Best-effort: clear IndexedDB application caches
    try {
      if (window.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(function (dbs) {
          dbs.forEach(function (db) {
            try { indexedDB.deleteDatabase(db.name); } catch (e) { /* ignore */ }
          });
        }).catch(function () { /* ignore */ });
      }
    } catch (e) { /* ignore */ }

    // 4) Go to the login page, replacing the current history entry
    window.location.replace(LOGIN_PAGE);
  };
})();

