/**
 * ConvertFlow targeting via Segment *audiences* (clear, linear version)
 * Steps:
 *  0) Basic guards
 *  1) One-per-page + cooldown
 *  2) Try cache (sessionStorage, then localStorage with TTL)
 *  3) Call endpoint (audiences only)
 *  4) Try popups in priority order (first true wins)
 */

(() => {
  if (typeof window === 'undefined') return;

  // ---- CONFIG ---------------------------------------------------
  const ENDPOINT = 'https://segment-endpoint-hp.vercel.app/api/hydropeptide';
  const AUDIENCES = ['alex_test_audience', 'quiz_takers']; // priority order
  const POPUPS = {
    alex_test_audience: '.cta-189760-trigger',
    quiz_takers: '.cta-189389-trigger'
  };
  const NS = 'cf_trigger_linear_v1';
  const TTL_HOURS = 6; // cache freshness
  const COOLDOWN_HOURS = 336; // don’t show any popup again within this window

  // ---- KEYS -----------------------------------------------------
  const KEY_PAGE_FIRED = `${NS}__popup_fired_this_page`;
  const KEY_LAST_POPUP = `${NS}__last_popup_at`;
  const keyAudienceCache   = (anonId) => `${NS}__audiences__${anonId}`;       // localStorage
  const keyAudienceCacheSS = (anonId) => `${NS}__audiences__${anonId}__ss`;   // sessionStorage

  // ---- UTILS ----------------------------------------------------
  const now = () => Date.now();
  const hours = (h) => Math.max(0, h) * 3600 * 1000;

  const getLS = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const setLS = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const getSS = (k, fb) => { try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const setSS = (k, v)  => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const within = (ts, ms) => typeof ts === 'number' && (now() - ts) < ms;
  const initFlags = () => AUDIENCES.reduce((o, k) => (o[k] = null, o), {});

  // ---- MAIN -----------------------------------------------------
  window.analytics.ready(async () => {
    console.log('[0] Analytics ready');
    const user = window.analytics.user();
    const anonId = user && typeof user.anonymousId === 'function' ? user.anonymousId() : null;
    if (!anonId) {
      console.log('[0] No anonymousId → stop');
      return;
    }

    // Step 1: page guard + cooldown
    if (getSS(KEY_PAGE_FIRED, false)) {
      console.log('[1] Popup already fired this page → stop');
      return;
    }
    const last = getLS(KEY_LAST_POPUP, 0);
    if (within(last, hours(COOLDOWN_HOURS))) {
      console.log('[1] In cooldown window → stop');
      return;
    }

    let resolved = initFlags();

    // Step 2: cache (session → local)
    const kSS = keyAudienceCacheSS(anonId);
    const kLS = keyAudienceCache(anonId);

    const ss = getSS(kSS, null);
    if (ss && within(ss.ts, hours(TTL_HOURS))) {
      console.log('[2] Using session cache');
      resolved = { ...resolved, ...ss.value };
      if (AUDIENCES.every(n => typeof resolved[n] === 'boolean')) {
        console.log('[2→4] Fully resolved from session cache → try popups');
        return tryPopupsAndFinish(resolved);
      }
    } else {
      const ls = getLS(kLS, null);
      if (ls && within(ls.ts, hours(TTL_HOURS))) {
        console.log('[2] Using local cache');
        resolved = { ...resolved, ...ls.value };
        setSS(kSS, { value: ls.value, ts: now() });
        if (AUDIENCES.every(n => typeof resolved[n] === 'boolean')) {
          console.log('[2→4] Fully resolved from local cache → try popups');
          return tryPopupsAndFinish(resolved);
        }
      } else {
        console.log('[2] No fresh cache');
      }
    }

    // Step 3: fetch audiences from server
    console.log('[3] Call endpoint to resolve audiences');
    const url = `${ENDPOINT}?anonymousId=${encodeURIComponent(anonId)}&audiences=${encodeURIComponent(AUDIENCES.join(','))}`;
    let fetched = {};
    try {
      const res = await fetch(url);
      const json = await res.json();
      const results = (json && json.audiences) ? json.audiences : {};

      for (const name of AUDIENCES) {
        const node = results[name];
        const bool =
          !!(node &&
             (node.boolean === true ||
              node.value === true ||
              (node.value && typeof node.value === 'object' && String(node.value.status || '').toLowerCase() === 'realized')));
        fetched[name] = bool;
        if (typeof resolved[name] !== 'boolean') resolved[name] = bool;
      }

      console.log('[3] Fetched from endpoint:', fetched);

      // Cache both places
      const pack = { value: fetched, ts: now() };
      setSS(kSS, pack);
      setLS(kLS, pack);
    } catch (e) {
      console.log('[3] Endpoint error, proceed with what we have:', e);
      // Defaults for any still-unknown flags
      for (const name of AUDIENCES) {
        if (typeof resolved[name] !== 'boolean') resolved[name] = false;
      }
    }

    // Step 4: try popups
    console.log('[4] Try popups by priority:', AUDIENCES.join(' → '));
    return tryPopupsAndFinish(resolved);
  });

  // ---- POPUP + FINISH -------------------------------------------
  function tryPopupsAndFinish(flags) {
    for (const name of AUDIENCES) {
      if (flags[name] === true) {
        const sel = POPUPS[name];
        console.log(POPUPS[name]);
        const ok = firePopup(sel);
        if (ok) {
          console.log(`[4] Fired popup for "${name}"`);
          return;
        }
        console.log(`[4] Popup element not found for "${name}" (${sel})`);
      }
    }
    console.log('[4] No eligible popup to fire');
  }

  function firePopup(selector) {
    if (!selector) return false;
    if (getSS(KEY_PAGE_FIRED, false)) return false;
    const el = document.querySelector(selector);
    console.log("FIRED");
    console.log(el);
    if (!el) return false;
    el.click();
    setSS(KEY_PAGE_FIRED, true);
    setLS(KEY_LAST_POPUP, now());
    return true;
  }
})();
