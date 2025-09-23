(function (w) {
  if (!w) return;

  const NS = 'segment_client_v1';
  const KEYS = {
    TRAITS: `${NS}__queued_traits`,
    TOUCHES: `${NS}__touches_v2`,
    TOUCH_WRITE_LOCK: `${NS}__touch_lock`,
  };

  const CONFIG = {
    maxTouches: 5,
    minHoursBetweenTouches: 48,
    requireMeaningfulChange: true,
  };

  const TOUCH_NAMES = ['first', 'second', 'third', 'fourth', 'fifth'];

  // ---------- Safe storage ----------
  const storage = {
    get(key, fallback) {
      try {
        const raw = w.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    },
    set(key, val) {
      try { w.localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
    },
    remove(key) {
      try { w.localStorage.removeItem(key); } catch (_) {}
    },
  };

  // ---------- Cleaning ----------
  function cleanValue(v) {
    if (v == null) return undefined;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s || s === 'null' || s === 'undefined') return undefined;
      return s;
    }
    if (Array.isArray(v)) {
      const arr = v.map(cleanValue).filter(x => x !== undefined);
      return arr.length ? arr : undefined;
    }
    if (typeof v === 'object') {
      const out = {};
      Object.entries(v).forEach(([k, val]) => {
        const cv = cleanValue(val);
        if (cv !== undefined) out[k] = cv;
      });
      return Object.keys(out).length ? out : undefined;
    }
    return v;
  }
  function cleanTraits(raw) {
    const out = {};
    Object.entries(raw || {}).forEach(([k, v]) => {
      const cv = cleanValue(v);
      if (cv !== undefined) out[k] = cv;
    });
    return out;
  }

  // ---------- Helpers ----------
  function nowISO() { return new Date().toISOString(); }
  function hoursSince(iso) {
    if (!iso) return Infinity;
    const then = new Date(iso).getTime();
    if (isNaN(then)) return Infinity;
    return (Date.now() - then) / 36e5;
  }
  function getRefDomain(ref) {
    try {
      if (!ref) return undefined;
      const u = new URL(ref);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }
  function getLandingPath(href) {
    try { return new URL(href).pathname || '/'; } catch { return '/'; }
  }
  function pickUTMsFromURL(u) {
    const qp = new URL(u).searchParams;
    const utm_source = qp.get('utm_source') || undefined;
    const utm_medium = qp.get('utm_medium') || undefined;
    const utm_campaign = qp.get('utm_campaign') || undefined;
    const utm_term = qp.get('utm_term') || undefined;
    const utm_content = qp.get('utm_content') || undefined;
    const any = utm_source || utm_medium || utm_campaign || utm_term || utm_content;
    return any ? { source: utm_source, medium: utm_medium, campaign: utm_campaign, term: utm_term, content: utm_content } : null;
  }
  function utmEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return ['source','medium','campaign','term','content'].every(k => (a[k] || null) === (b[k] || null));
  }

  // Decide if the current visit is new touch relative to the last recorded touch
  function shouldAddNewTouch(touches, current) {
    if (!touches.length) return true;
    const last = touches[touches.length - 1];

    // cooldown
    if (hoursSince(last.at) < CONFIG.minHoursBetweenTouches) return false;

    if (!CONFIG.requireMeaningfulChange) return true;

    const lastHasUTM = !!last.utm;
    const curHasUTM  = !!current.utm;

    // If either side has UTMs, require UTMs to differ to count as a new touch
    if (lastHasUTM || curHasUTM) {
      return !utmEqual(last.utm, current.utm);
    }

    // When neither side has UTMs, fall back to referrer domain change
    const lastRef = last.ref_domain || null;
    const curRef  = current.ref_domain || null;
    return (lastRef !== curRef);
  }

  function flattenTouchesToTraits(touches) {
    const traits = {};
    const limit = Math.min(touches.length, CONFIG.maxTouches);

    for (let i = 0; i < limit; i++) {
      const label = TOUCH_NAMES[i]; // first, second, ...
      const t = touches[i];

      traits[`${label}_touch_at`] = t.at;
      traits[`${label}_touch_url`] = t.url;
      traits[`${label}_touch_path`] = t.path;
      traits[`${label}_touch_referrer_domain`] = t.ref_domain || undefined;

      // UTM flatten
      if (t.utm) {
        traits[`${label}_touch_source`]   = t.utm.source   || undefined;
        traits[`${label}_touch_medium`]   = t.utm.medium   || undefined;
        traits[`${label}_touch_campaign`] = t.utm.campaign || undefined;
        traits[`${label}_touch_term`]     = t.utm.term     || undefined;
        traits[`${label}_touch_content`]  = t.utm.content  || undefined;
      }
    }

    // Backward-compat for anything using only "first"
    if (touches[0]) {
      const t0 = touches[0];
      traits.first_touch_at = t0.at;
      traits.first_touch_url = t0.url;
      traits.first_touch_path = t0.path;
      traits.first_touch_referrer_domain = t0.ref_domain || undefined;
      if (t0.utm) {
        traits.utm_source   = t0.utm.source   || undefined;
        traits.utm_medium   = t0.utm.medium   || undefined;
        traits.utm_campaign = t0.utm.campaign || undefined;
        traits.utm_term     = t0.utm.term     || undefined;
        traits.utm_content  = t0.utm.content  || undefined;
      }
    }

    return cleanTraits(traits);
  }

  const SegmentClient = {
    debug: false,
    traits: {},

    init({ debug = false } = {}) {
      this.debug = !!debug;
      this.traits = storage.get(KEYS.TRAITS, {}) || {};
      if (this.debug) console.log('[SegmentClient] init', this.traits);
    },

    setTrait(key, value) {
      const cv = cleanValue(value);
      if (cv === undefined) delete this.traits[key];
      else this.traits[key] = cv;
      storage.set(KEYS.TRAITS, this.traits);
      if (this.debug) console.log(`[SegmentClient] setTrait: ${key} =`, cv);
    },

    setTraits(obj = {}) {
      const cleaned = cleanTraits(obj);
      this.traits = { ...this.traits, ...cleaned };
      storage.set(KEYS.TRAITS, this.traits);
      if (this.debug) console.log('[SegmentClient] setTraits', cleaned);
    },

    trackEvent(name, props = {}) {
      if (typeof w.analytics === 'undefined') {
        if (this.debug) console.warn('[SegmentClient] analytics not ready: track dropped');
        return;
      }
      const p = cleanTraits(props) || {};
      try {
        w.analytics.track(name, p);
        if (this.debug) console.log('[SegmentClient] track', name, p);
      } catch (e) {
        if (this.debug) console.warn('[SegmentClient] track failed', e);
      }
    },

    identify(userId, extraTraits = {}) {
      const stored = storage.get(KEYS.TRAITS, {});
      const merged = cleanTraits({ ...stored, ...this.traits, ...extraTraits });

      if (typeof w.analytics === 'undefined') {
        if (this.debug) console.warn('[SegmentClient] analytics not ready: identify skipped (traits kept)');
        this.traits = merged;
        storage.set(KEYS.TRAITS, this.traits);
        return false;
      }

      const exec = () => {
        const hasId = (typeof userId === 'string' && userId.trim());
        try {
          if (hasId) {
            w.analytics.identify(userId.trim(), merged);
            if (this.debug) console.log('[SegmentClient] identify (with id)', userId, merged);
          } else {
            w.analytics.identify(merged);
            if (this.debug) console.log('[SegmentClient] identify (anonymous)', merged);
          }
          // only clear queued local traits we manage
          this.traits = {};
          storage.remove(KEYS.TRAITS);
          return true;
        } catch (e) {
          if (this.debug) console.warn('[SegmentClient] identify failed; traits kept for retry', e);
          this.traits = merged;
          storage.set(KEYS.TRAITS, this.traits);
          return false;
        }
      };

      if (typeof w.analytics?.ready === 'function') {
        w.analytics.ready(exec);
        return true;
      } else {
        return exec();
      }
    },

    // NEW: generalized multi-touch capture (first..fifth + last)
    storeTouch() {
      // lightweight lock to prevent concurrent double-writes on fast nav
      const lock = storage.get(KEYS.TOUCH_WRITE_LOCK, null);
      if (lock && Date.now() - lock < 1500) return;
      storage.set(KEYS.TOUCH_WRITE_LOCK, Date.now());

      const run = () => {
        if (!w.analytics) {
          setTimeout(run, 200);
          return;
        }

        // Build the current touch context
        const cur = {
          at: nowISO(),
          url: w.location.href,
          path: getLandingPath(w.location.href),
          ref_domain: getRefDomain(document.referrer),
          utm: pickUTMsFromURL(w.location.href)
        };

        let touches = storage.get(KEYS.TOUCHES, []);
        touches = Array.isArray(touches) ? touches : [];

        let added = false;

        if (!touches.length) {
          touches.push(cur);
          added = true;
        } else {
          // Decide if current visit should become a new touch
          if (touches.length < CONFIG.maxTouches && shouldAddNewTouch(touches, cur)) {
            touches.push(cur);
            added = true;
          } else {
            // blank on purpose
          }
        }

        // Persist locally
        storage.set(KEYS.TOUCHES, touches);
        storage.set(KEYS.TOUCH_WRITE_LOCK, null);

        // Flatten to traits and enqueue locally so any later identify() includes them
        const flattened = flattenTouchesToTraits(touches);
        this.setTraits(flattened);

        if (!added) {
          if (this.debug) console.log('[SegmentClient] touch not added (cooldown or not meaningful); traits updated for last touch snapshot');
          return;
        }

        // Send an immediate identify with the updated touch traits
        try {
          const u = (typeof w.analytics.user === 'function') ? w.analytics.user() : null;
          const id = u ? (typeof u.id === 'function' ? u.id() : u.id) : null;
          if (id) {
            if (this.debug) console.log('[SegmentClient] sending identify for new touch (identified)');
            w.analytics.identify(id, flattened);
          } else {
            if (this.debug) console.log('[SegmentClient] sending identify for new touch (anonymous)');
            w.analytics.identify(flattened);
          }
        } catch (e) {
          if (this.debug) console.warn('[SegmentClient] identify for new touch failed; traits remain queued', e);
        }
      };

      if (typeof w.analytics?.ready === 'function') {
        w.analytics.ready(run);
      } else if ('requestIdleCallback' in w) {
        w.requestIdleCallback(run, { timeout: 1000 });
      } else {
        setTimeout(run, 0);
      }
    },

    setConsent({
      email = null,
      optedIn = null,
      channel = 'email', // email, sms
      extraTraits = {} // any extras we want to send
    } = {}) {
      if (optedIn === null) return false; // don't update anything if no optin

      const userId = (typeof email === 'string' && email.trim()) ? email.trim() : null;
      const bool = optedIn === true;

      const traits = { ...extraTraits };

      if (channel === 'email') {
        traits.email = userId || traits.email; // helps identity resolution
        traits.email_subscribed = bool; // generic flag many tools map
        traits.consent_email_subscribed = bool; // extra compatibility
      }

      if (channel === 'sms') {
        traits.sms_subscribed = bool;
        traits.consent_sms_subscribed = bool;
      }

      if (this.debug) console.log('[SegmentClient] setConsent(minimal):', { userId, channel, traits });

      return this.identify(userId, traits);
    },

    reset() {
      this.traits = {};
      storage.remove(KEYS.TRAITS);
      storage.remove(KEYS.TOUCHES);
      storage.remove(KEYS.TOUCH_WRITE_LOCK);
      if (this.debug) console.log('[SegmentClient] reset');
    }
  };

  w.SegmentClient = SegmentClient;
})(typeof window !== 'undefined' ? window : null);

// Init + run on every pageview
SegmentClient.init({ debug: false });
SegmentClient.storeTouch();

// This is just a debugger for ConvertFlow, it fires whenever something "happens" and reveals all data
// E.g. when user clicks through a popup quiz, it fires everytime something happens
if (SegmentClient.debug) {
  window.addEventListener("DOMContentLoaded", function () {
    [
      "cfView",
      "cfConversion",
      "cfAnswer",
      "cfSubmit",
      "cfAddToCart",
      "cfCompletion",
      "cfClose"
    ].forEach(function (eventType) {
      window.addEventListener(eventType, function (e) {
        console.log("[CF Debug]", eventType, e.detail);
      });
    });
  });
}