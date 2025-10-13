/* --------------------------------------------------------------
  Alex's SegmentClient that automates how we send data to Segment

  - Auto runs with .init() on each page
  - Auto runs .storeTouch() to manually track visits as events (with cooldown)
  - Creates a SegmentClient object with .trackEvent(), .identify(), and setConsent()
    (It's a window object so we can run it inside any marketing tool we want)
    E.g. SegmentClient.identify(email, { extraDetails });
    E.g. SegmentClient.trackEvent("User scrolled 50%");
-------------------------------------------------------------- */
(function (w) {
  if (!w) return;

  const NS = 'segment_client_v1';
  const KEYS = {
    TRAITS: `${NS}__queued_traits`,
    LAST_TOUCH_AT: `${NS}__last_touch_at`,
    TOUCH_WRITE_LOCK: `${NS}__touch_lock`,
  };

  const CONFIG = {
    minHoursBetweenTouches: 4, // how long between recording "touch"
  };

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
  function getPath(href) {
    try { return new URL(href).pathname || '/'; } catch { return '/'; }
  }
  function pickUTMsFromURL(u) {
    const qp = new URL(u).searchParams;
    const utm_source = qp.get('utm_source') || undefined;
    const utm_medium = qp.get('utm_medium') || undefined;
    const utm_campaign = qp.get('utm_campaign') || undefined;
    const utm_term = qp.get('utm_term') || undefined;
    const utm_content = qp.get('utm_content') || undefined;
    return {
      utm_source, utm_medium, utm_campaign, utm_term, utm_content
    };
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

    /**
     * Touch recorder: emit an immutable event with cooldown to avoid noise.
     * Name: "Touch Recorded"
     * Props: at, url, path, referrer_domain, utm_* (source/medium/campaign/term/content)
     */
    storeTouch() {
      // prevent rapid double-writes on SPA nav/fast loads
      const lock = storage.get(KEYS.TOUCH_WRITE_LOCK, null);
      if (lock && Date.now() - lock < 1500) return;
      storage.set(KEYS.TOUCH_WRITE_LOCK, Date.now());

      const run = () => {
        const lastAt = storage.get(KEYS.LAST_TOUCH_AT, null);
        if (hoursSince(lastAt) < CONFIG.minHoursBetweenTouches) {
          if (this.debug) console.log('[SegmentClient] touch skipped (cooldown)');
          storage.set(KEYS.TOUCH_WRITE_LOCK, null);
          return;
        }

        const props = {
          at: nowISO(),
          url: w.location.href,
          path: getPath(w.location.href),
          referrer_domain: getRefDomain(document.referrer),
          ...pickUTMsFromURL(w.location.href)
        };

        try {
          if (typeof w.analytics?.track === 'function') {
            w.analytics.track('Touch Recorded', cleanTraits(props));
            if (this.debug) console.log('[SegmentClient] Touch Recorded', props);
            storage.set(KEYS.LAST_TOUCH_AT, props.at);
          } else {
            if (this.debug) console.warn('[SegmentClient] analytics.track unavailable');
          }
        } catch (e) {
          if (this.debug) console.warn('[SegmentClient] Touch Recorded failed', e);
        } finally {
          storage.set(KEYS.TOUCH_WRITE_LOCK, null);
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
      source = 'unknown'
    } = {}) {
      if (optedIn !== true) {
        if (this.debug) console.log('[SegmentClient] consent skipped (no positive opt-in)');
        return;
      }

      const userId = (typeof email === 'string' && email.trim())
        ? email.trim().toLowerCase()
        : null;

      const traits = {
        // Klaviyo traits
        $consent: ['email'],
        consent_source: source,
        consent_given_at: new Date().toISOString(),

        // generic traits
        email_subscribed: true,
      };

      if (userId) {
        traits.$email = userId; // Klaviyo trait
        traits.email = userId;  // generic trait
      }

      if (!userId) {
        this.setTraits(traits); // queue for next identify
        if (this.debug) console.log('[SegmentClient] consent queued (awaiting $email)', traits);
        return;
      }

      this.identify(userId, traits); // fire identify with additive consent
      if (this.debug) console.log('[SegmentClient] identify with Klaviyo consent', { userId, traits });
    },

    reset() {
      this.traits = {};
      storage.remove(KEYS.TRAITS);
      storage.remove(KEYS.LAST_TOUCH_AT);
      storage.remove(KEYS.TOUCH_WRITE_LOCK);
      if (this.debug) console.log('[SegmentClient] reset');
    }
  };

  w.SegmentClient = SegmentClient;
})(typeof window !== 'undefined' ? window : null);

// Init + run on every pageview
SegmentClient.init({ debug: true });
SegmentClient.storeTouch();

// simple debugger for ConvertFlow, listens for events and returns details
// totally unrelated to this file tbh but just useful lol (will delete)
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
