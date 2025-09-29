/**
 * ConvertFlow targeting via Segment traits (clear, linear version)
 * Steps:
 *  0) Basic guards
 *  1) One-per-page + cooldown
 *  2) Try existing Segment traits (already on the user object)
 *  3) Try cache (sessionStorage, then localStorage with TTL)
 *  4) Call endpoint (if still unknown)
 *  5) Store traits locally via analytics.identify (to make future pages cheap)
 *  6) Try aspirational popup (priority) then affluent popup
 */

(() => {
  if (typeof window === 'undefined') return;

  // ---- CONFIG (edit these) ---------------------------------------------------
  const ENDPOINT = 'https://segment-endpoint-hp.vercel.app/api/hydropeptide';
  const TRAITS = ['is_affluent', 'is_aspirational',];
  // const TRAITS = ['last_touch_path', 'fourth_touch_path',]; // priority order (aspirational first)
  // const POPUPS = {
  //   last_touch_path: '.cta-189389-trigger',
  //   fourth_touch_path: '.cta-189760-trigger'
  // };
  const POPUPS   = {
    is_aspirational: '.cta-189760-trigger',
    is_affluent:     '.cta-189389-trigger'
  };
  const NS = 'cf_trigger_linear_v1';
  const TTL_HOURS      = 6;   // cache freshness
  const COOLDOWN_HOURS = 24;  // don’t show any popup again within this window

  // ---- KEYS ------------------------------------------------------------------
  const KEY_PAGE_FIRED   = `${NS}__popup_fired_this_page`;
  const KEY_LAST_POPUP   = `${NS}__last_popup_at`;
  const keyTraitCache    = (anonId) => `${NS}__traits__${anonId}`;        // localStorage
  const keyTraitCacheSS  = (anonId) => `${NS}__traits__${anonId}__ss`;    // sessionStorage

  // ---- UTILS -----------------------------------------------------------------
  const now = () => Date.now();
  const hours = (h) => Math.max(0, h) * 3600 * 1000;

  const getLS = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const setLS = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const getSS = (k, fb) => { try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const setSS = (k, v)  => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const within = (ts, ms) => typeof ts === 'number' && (now() - ts) < ms;

  // ---- STEP 0: wait for analytics, basic guards --------------------------------
  window.analytics.ready(async () => {
    console.log('[0] Analytics ready');
    const user   = window.analytics.user();
    const anonId = user && typeof user.anonymousId === 'function' ? user.anonymousId() : null;

    if (!anonId) {
      console.log('[0] No anonymousId → stop');
      return;
    }

    // ---- STEP 1: One-per-page + cooldown --------------------------------------
    console.log('[1] Check page-guard & cooldown');
    if (getSS(KEY_PAGE_FIRED, false)) {
      console.log('[1] Popup already fired this page → stop');
      return;
    }
    const last = getLS(KEY_LAST_POPUP, 0);
    if (within(last, hours(COOLDOWN_HOURS))) {
      console.log('[1] In cooldown window → stop');
      return;
    }

    // We’ll fill this as soon as we know anything
    let resolved = { is_aspirational: null, is_affluent: null };

    // ---- STEP 2: Try existing traits on the user object -----------------------
    console.log('[2] Check analytics.user().traits()');
    try {
      const t = typeof user.traits === 'function' ? user.traits() : {};
      let found = false;
      for (const name of TRAITS) {
        if (Object.prototype.hasOwnProperty.call(t, name)) {
          resolved[name] = !!t[name];
          found = true;
        }
      }
      if (found) {
        console.log('[2] Found traits on user object:', resolved);
      } else {
        console.log('[2] No relevant traits on user object');
      }
    } catch (e) {
      console.log('[2] Error reading user traits, continue:', e);
    }

    // If both traits already known, we can jump to step 6
    if (TRAITS.every(n => typeof resolved[n] === 'boolean')) {
      console.log('[2→6] Traits fully resolved from user → try popups');
      return tryPopupsAndFinish(resolved);
    }

    // ---- STEP 3: Try cache (sessionStorage, then localStorage) ----------------
    console.log('[3] Check cache (session → local)');
    const kSS = keyTraitCacheSS(anonId);
    const kLS = keyTraitCache(anonId);

    const ss = getSS(kSS, null);
    if (ss && within(ss.ts, hours(TTL_HOURS))) {
      console.log('[3] Using session cache');
      resolved = { ...resolved, ...ss.value };
      if (TRAITS.every(n => typeof resolved[n] === 'boolean')) {
        console.log('[3→6] Traits fully resolved from session cache → try popups');
        return tryPopupsAndFinish(resolved);
      }
    } else {
      const ls = getLS(kLS, null);
      if (ls && within(ls.ts, hours(TTL_HOURS))) {
        console.log('[3] Using local cache');
        resolved = { ...resolved, ...ls.value };
        // hydrate session cache
        setSS(kSS, { value: ls.value, ts: now() });
        if (TRAITS.every(n => typeof resolved[n] === 'boolean')) {
          console.log('[3→6] Traits fully resolved from local cache → try popups');
          return tryPopupsAndFinish(resolved);
        }
      } else {
        console.log('[3] No fresh cache');
      }
    }

    // ---- STEP 4: Call endpoint (only if still unknown) ------------------------
    console.log('[4] Call endpoint to resolve traits');
    const url = `${ENDPOINT}?anonymousId=${encodeURIComponent(anonId)}&traits=${encodeURIComponent(TRAITS.join(','))}`;
    let fetched = {};
    try {
      const res = await fetch(url);
      const json = await res.json();
      const results = json && json.results ? json.results : {};
      // Normalize to booleans; default false if absent
      for (const name of TRAITS) {
        fetched[name] = !!(results[name] && results[name].value === true);
        if (typeof resolved[name] !== 'boolean') {
          resolved[name] = fetched[name];
        }
      }
      console.log('[4] Fetched from endpoint:', fetched);
      // Cache both places
      const pack = { value: fetched, ts: now() };
      setSS(kSS, pack);
      setLS(kLS, pack);
    } catch (e) {
      console.log('[4] Endpoint error, proceed with what we have:', e);
      // If still unknown, set safe defaults to false
      for (const name of TRAITS) {
        if (typeof resolved[name] !== 'boolean') resolved[name] = false;
      }
    }

    // ---- STEP 5: Identify locally (so next page can stop at step 2) ----------
    console.log('[5] Identify locally with resolved traits:', resolved);
    try {
      window.analytics.identify({ ...resolved });
    } catch (e) {
      console.log('[5] identify() failed (non-fatal):', e);
    }

    // ---- STEP 6: Try popups in priority order --------------------------------
    console.log('[6] Try popups by priority:', TRAITS.join(' → '));
    return tryPopupsAndFinish(resolved);
  });

  // ---- POPUP + FINISH ---------------------------------------------------------
  function tryPopupsAndFinish(traits) {
    // Priority: first true wins
    for (const name of TRAITS) {
      console.log(`Name of trait: ${name}, traits obj: ${traits[name]}`)
      if (traits[name] === true) {
        const sel = POPUPS[name];
        console.log(`Sel: ${sel}`)
        const ok = firePopup(sel);
        if (ok) {
          console.log(`[6] Fired popup for "${name}"`);
          return;
        }
        console.log(`[6] Popup element not found for "${name}" (${sel})`);
        // If not found, keep checking the next trait
      }
    }
    console.log('[6] No eligible popup to fire');
  }

  function firePopup(selector) {
    if (!selector) return false;
    if (getSS(KEY_PAGE_FIRED, false)) return false;
    const el = document.querySelector(selector);
    console.log(el);
    if (!el) return false;
    // el.click(); // Alex - removed try { .. } catch {} - seems to work okay
    setTimeout(() => el.click(), 1000);
    setSS(KEY_PAGE_FIRED, true);
    setLS(KEY_LAST_POPUP, now());
    return true;
  }
})();
