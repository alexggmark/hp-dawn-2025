/**
 * ConvertFlow targeting via product view tracking
 * Steps:
 *  0) Check if we're on a product page with popup_trigger data
 *  1) One-per-page + cooldown guards
 *  2) Track product view in localStorage (array of handles per audience)
 *  3) Check if any audience meets threshold
 *  4) Fire popup for first qualifying audience (priority order)
 *  5) If none qualify yet, continue tracking
 */

(async () => {
  if (typeof window === 'undefined') return;

  const debug = true;

  // ---- CONFIG ---------------------------------------------------
  const NS = 'cf_product_tracking_v1';
  const COOLDOWN_HOURS = 72; // don't show any popup again within this window
  const TOUCH_COOLDOWN_HOURS = 4;

  // ---- KEYS -----------------------------------------------------
  const KEY_PAGE_FIRED = `${NS}__popup_fired_this_page`;
  const KEY_LAST_POPUP = `${NS}__last_popup_at`;
  const KEY_PRODUCT_VIEWS = `${NS}__product_views`; // stores {audience_key: [handle1, handle2, ...]}
  const KEY_TOUCH_LOCK = `${NS}__touch_write_lock`;
  const KEY_THRESHOLDS = `${NS}__thresholds`; // stores {audience_key: number_to_view_to_trigger}
  const KEY_POPUP_ELEMENTS = `${NS}__popup_elements`; // stores {audience_key: popup_element_key}

  // ---- UTILS ----------------------------------------------------
  const now = () => Date.now();
  const hours = (h) => Math.max(0, h) * 3600 * 1000;

  const getLS = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const setLS = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const getSS = (k, fb) => { try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const setSS = (k, v)  => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const within = (ts, ms) => typeof ts === 'number' && (now() - ts) < ms;

  // ---- WAIT FOR DOM ---------------------------------------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(500); // shorter wait since no analytics dependency

  // ---- MAIN -----------------------------------------------------
  if (debug) console.log('[0] Checking for popup trigger data');

  // Check if we have popup trigger data from Liquid
  if (!window.popup_trigger) {
    if (debug) console.log('[0] No popup_trigger data → not a tracked product page');
    return;
  }

  const { audience_key, product, popup_element, number_to_view_to_trigger } = window.popup_trigger;

  if (!audience_key || !product || !popup_element || !number_to_view_to_trigger) {
    if (debug) console.log('[0] Incomplete popup_trigger data → stop');
    return;
  }

  if (debug) console.log('[0] Product page tracked:', { audience_key, product, popup_element, number_to_view_to_trigger });

  // Step 0: STORE TOUCH CHECK
  if (!storeTouch()) {
    if (debug) console.log('[0] Touch cooldown active → stop (user recently active)');
    return;
  }

  // Step 1: page guard + cooldown
  if (getSS(KEY_PAGE_FIRED, false)) {
    if (debug) console.log('[1] Popup already fired this page → stop');
    return;
  }

  const lastPopupAt = getLS(KEY_LAST_POPUP, 0);
  if (within(lastPopupAt, hours(COOLDOWN_HOURS))) {
    if (debug) console.log('[1] In cooldown window → stop (but still tracking product view)');
    // Still track the product view, just don't try to fire popup
    trackProductView(audience_key, product);
    return;
  }

  // Step 2: Track product view
  trackProductView(audience_key, product);
  
  // Store threshold and popup element for this audience (in case it changes)
  const thresholds = getLS(KEY_THRESHOLDS, {});
  thresholds[audience_key] = number_to_view_to_trigger;
  setLS(KEY_THRESHOLDS, thresholds);

  const popupElements = getLS(KEY_POPUP_ELEMENTS, {});
  popupElements[audience_key] = popup_element;
  setLS(KEY_POPUP_ELEMENTS, popupElements);

  // Step 3: Check if any audience qualifies
  const productViews = getLS(KEY_PRODUCT_VIEWS, {});
  const storedThresholds = getLS(KEY_THRESHOLDS, {});
  const storedPopupElements = getLS(KEY_POPUP_ELEMENTS, {});

  // Get all audience keys sorted by priority (order they appear in our tracking)
  const allAudienceKeys = Object.keys(productViews);
  
  if (debug) console.log('[3] Current product views:', productViews);
  if (debug) console.log('[3] Thresholds:', storedThresholds);

  // Step 4: Try to fire popup for first qualifying audience
  for (const key of allAudienceKeys) {
    const viewedProducts = productViews[key] || [];
    const threshold = storedThresholds[key];
    const popupEl = storedPopupElements[key];

    if (viewedProducts.length >= threshold) {
      if (debug) console.log(`[4] Audience "${key}" qualifies (${viewedProducts.length}/${threshold})`);
      
      if (!popupEl) {
        if (debug) console.log(`[4] No popup element stored for "${key}" → skip`);
        continue;
      }

      // Generate and click the button
      const success = firePopup(popupEl, key);
      if (success) {
        if (debug) console.log(`[4] ✓ Fired popup for "${key}"`);
        return;
      } else {
        if (debug) console.log(`[4] Failed to fire popup for "${key}"`);
      }
    } else {
      if (debug) console.log(`[4] Audience "${key}" does not qualify yet (${viewedProducts.length}/${threshold})`);
    }
  }

  if (debug) console.log('[4] No qualifying audience → continue tracking');

  // ---- TRACK PRODUCT VIEW ---------------------------------------
  function trackProductView(audienceKey, productHandle) {
    const views = getLS(KEY_PRODUCT_VIEWS, {});
    
    if (!views[audienceKey]) {
      views[audienceKey] = [];
    }

    // Only add if not already in array
    if (!views[audienceKey].includes(productHandle)) {
      views[audienceKey].push(productHandle);
      if (debug) console.log(`[2] Added "${productHandle}" to "${audienceKey}" audience (total: ${views[audienceKey].length})`);
    } else {
      if (debug) console.log(`[2] Product "${productHandle}" already tracked in "${audienceKey}"`);
    }

    setLS(KEY_PRODUCT_VIEWS, views);
  }

  // ---- STORE TOUCH ----------------------------------------------
  /**
   * Returns true if we should proceed with tracking, false if in cooldown
   * Prevents over-tracking when user is actively browsing
   */
  function storeTouch() {
    // Prevent rapid double-writes (SPA nav, fast reloads)
    const lock = getLS(KEY_TOUCH_LOCK, null);
    if (lock && (now() - lock) < 1500) {
      if (debug) console.log('[0] Touch write lock active → stop');
      return false;
    }

    setLS(KEY_TOUCH_LOCK, now());

    const lastTouchAt = getLS(KEY_LAST_TOUCH, 0);
    
    // If user was here recently, skip tracking this page view
    if (within(lastTouchAt, hours(TOUCH_COOLDOWN_HOURS))) {
      if (debug) console.log(`[0] Touch cooldown active (last: ${Math.round((now() - lastTouchAt) / 60000)}min ago)`);
      setLS(KEY_TOUCH_LOCK, null);
      return false;
    }

    // Update last touch timestamp
    setLS(KEY_LAST_TOUCH, now());
    setLS(KEY_TOUCH_LOCK, null);
  
    if (debug) console.log('[0] Touch recorded → proceed with tracking');
    return true;
  }

  // ---- FIRE POPUP -----------------------------------------------
  function firePopup(popupElementKey, audienceKey) {
    if (!popupElementKey) return false;

    // Create hidden trigger button
    const wrap = document.createElement('div');
    wrap.id = 'cf-trigger-temp';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.setAttribute('role', 'presentation');
    wrap.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;';
    wrap.innerHTML = `<button type="button" tabindex="-1" class="${popupElementKey}"></button>`;
    document.body.prepend(wrap);

    // Small delay to ensure ConvertFlow registers the button
    setTimeout(() => {
      const el = document.querySelector(`.${popupElementKey}`);
      if (!el) {
        if (debug) console.log(`[4] Popup element not found: .${popupElementKey}`);
        return false;
      }

      el.click();
      setSS(KEY_PAGE_FIRED, true);
      setLS(KEY_LAST_POPUP, now());
      
      if (debug) console.log(`[4] Clicked popup trigger for audience "${audienceKey}"`);
    }, 300);

    return true;
  }
})();