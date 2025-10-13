/**
 * ConvertFlow targeting via Segment *audiences* (clear, linear version)
 * Steps:
 *  0) Basic guards
 *  1) One-per-page + cooldown
 *  2) Try cache (sessionStorage, then localStorage with TTL)
 *  3) Call endpoint (audiences only) with timeout
 *  4) Try popups in priority order (first true wins)
 *  5) If none fire, set a no-result cooldown to avoid re-checking every page
 */

(async () => {
  if (typeof window === 'undefined') return;

  const debug = true;

  // ---- CONFIG ---------------------------------------------------
  const ENDPOINT = 'https://segment-endpoint-hp.vercel.app/api/hydropeptide';
  const AUDIENCES = ['affluent_pop_up_trigger_to_edit_conditions', 'aspirational_audience']; // priority order
  const POPUPS = {
    aspirational_audience: '.cta-189760-trigger',
    affluent_pop_up_trigger_to_edit_conditions: '.cta-189389-trigger'
  };

  const NS = 'cf_trigger_linear_v1';
  const TTL_HOURS = 6;        // cache freshness for audience flags
  const COOLDOWN_HOURS = 72; // don’t show any popup again within this window
  const NO_RESULT_COOLDOWN_HOURS = 24; // skip checks for this long after "no eligible popup"
  const FETCH_TIMEOUT_MS = 1500;

  // ---- KEYS -----------------------------------------------------
  const KEY_PAGE_FIRED = `${NS}__popup_fired_this_page`;
  const KEY_LAST_POPUP = `${NS}__last_popup_at`;
  const KEY_NO_RESULT  = `${NS}__no_result_at`;

  // versioned cache salt (auto-bust when you change audience names/order)
  const AUDIENCE_KEY_SALT = `${NS}__v1__${AUDIENCES.join(',')}`;
  const keyAudienceCache   = (anonId) => `${AUDIENCE_KEY_SALT}__audiences__${anonId}`;       // localStorage
  const keyAudienceCacheSS = (anonId) => `${AUDIENCE_KEY_SALT}__audiences__${anonId}__ss`;   // sessionStorage

  // ---- GENERATING BUTTONS ---------------------------------------
  (function () {
    const wrap = document.createElement('div');
    wrap.id = 'cf-triggers';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.setAttribute('role', 'presentation');
    wrap.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;';
    wrap.innerHTML = `\
      <button type="button" tabindex="-1" class="${POPUPS.affluent_pop_up_trigger_to_edit_conditions}"></button>\
      <button type="button" tabindex="-1" class="${POPUPS.aspirational_audience}"></button>`;
    document.body.prepend(wrap);
  })();

  // ---- WAITING FOR DOM ------------------------------------------
  // Forcing a wait so there's no race with buttons + triggers
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(1000);

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
    if (debug === true) console.log('[0] Analytics ready');
    const user = window.analytics.user();
    const anonId = user && typeof user.anonymousId === 'function' ? user.anonymousId() : null;
    if (!anonId) {
      if (debug === true) console.log('[0] No anonymousId → stop');
      return;
    }

    // Early exit if we recently found "no eligible popup"
    const lastNoResult = getLS(KEY_NO_RESULT, 0);
    if (within(lastNoResult, hours(NO_RESULT_COOLDOWN_HOURS))) {
      if (debug === true) console.log('[0] No-result cooldown → stop');
      return;
    }

    // Step 1: page guard + cooldown
    if (getSS(KEY_PAGE_FIRED, false)) {
      if (debug === true) console.log('[1] Popup already fired this page → stop');
      return;
    }
    const lastPopupAt = getLS(KEY_LAST_POPUP, 0);
    if (within(lastPopupAt, hours(COOLDOWN_HOURS))) {
      if (debug === true) console.log('[1] In cooldown window → stop');
      return;
    }

    let resolved = initFlags();

    // Step 2: cache (session → local)
    const kSS = keyAudienceCacheSS(anonId);
    const kLS = keyAudienceCache(anonId);

    const ss = getSS(kSS, null);
    if (ss && within(ss.ts, hours(TTL_HOURS))) {
      if (debug === true) console.log('[2] Using session cache');
      resolved = { ...resolved, ...ss.value };
      if (AUDIENCES.every(n => typeof resolved[n] === 'boolean')) {
        if (debug === true) console.log('[2→4] Fully resolved from session cache → try popups');
        return tryPopupsAndFinish(resolved);
      }
    } else {
      const ls = getLS(kLS, null);
      if (ls && within(ls.ts, hours(TTL_HOURS))) {
        if (debug === true) console.log('[2] Using local cache');
        resolved = { ...resolved, ...ls.value };
        setSS(kSS, { value: ls.value, ts: now() });
        if (AUDIENCES.every(n => typeof resolved[n] === 'boolean')) {
          if (debug === true) console.log('[2→4] Fully resolved from local cache → try popups');
          return tryPopupsAndFinish(resolved);
        }
      } else {
        if (debug === true) console.log('[2] No fresh cache');
      }
    }

    // Step 3: fetch audiences from server (with timeout)
    if (debug === true) console.log('[3] Call endpoint to resolve audiences');
    const url = `${ENDPOINT}?anonymousId=${encodeURIComponent(anonId)}&audiences=${encodeURIComponent(AUDIENCES.join(','))}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let fetched = {};
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

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

      if (debug === true) console.log('[3] Fetched from endpoint:', fetched);

      // Cache both places
      const pack = { value: fetched, ts: now() };
      setSS(kSS, pack);
      setLS(kLS, pack);
    } catch (e) {
      clearTimeout(timer);
      if (debug === true) console.log('[3] Endpoint error, proceed with what we have:', e);
      // Defaults for any still-unknown flags
      for (const name of AUDIENCES) {
        if (typeof resolved[name] !== 'boolean') resolved[name] = false;
      }
    }

    // Step 4: try popups
    if (debug === true) console.log('[4] Try popups by priority:', AUDIENCES.join(' → '));
    return tryPopupsAndFinish(resolved);
  });

  // ---- POPUP + FINISH -------------------------------------------
  function tryPopupsAndFinish(flags) {
    for (const name of AUDIENCES) {
      if (flags[name] === true) { // fire only when in audience
        const sel = POPUPS[name];
        if (debug === true) console.log(`[4] Attempt popup for "${name}" → ${sel}`);
        const ok = firePopup(sel);
        if (ok) {
          if (debug === true) console.log(`[4] Fired popup for "${name}"`);
          return;
        }
        if (debug === true) console.log(`[4] Popup element not found for "${name}" (${sel})`);
      }
    }

    // If no popup fired, set a "no-result" cooldown to avoid re-checking every page
    if (debug === true) console.log('[4] No eligible popup to fire → set no-result cooldown');
    setLS(KEY_NO_RESULT, now());
  }

  function firePopup(selector) {
    if (!selector) return false;
    const el = document.querySelector(selector);
    if (!el) return false;
    el.click();
    setSS(KEY_PAGE_FIRED, true);
    setLS(KEY_LAST_POPUP, now());
    return true;
  }
})();
