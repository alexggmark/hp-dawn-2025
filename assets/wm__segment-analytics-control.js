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
        traits[`${label}_touch_source`] = t.utm.source || undefined;
        traits[`${label}_touch_medium`] = t.utm.medium || undefined;
        traits[`${label}_touch_campaign`] = t.utm.campaign || undefined;
        traits[`${label}_touch_term`] = t.utm.term || undefined;
        traits[`${label}_touch_content`] = t.utm.content || undefined;
      }
    }

    // Always include "last touch" snapshot
    const last = touches[limit - 1];
    if (last) {
      traits.last_touch_at = last.at;
      traits.last_touch_url = last.url;
      traits.last_touch_path = last.path;
      traits.last_touch_referrer_domain = last.ref_domain || undefined;
      if (last.utm) {
        traits.last_touch_source = last.utm.source || undefined;
        traits.last_touch_medium = last.utm.medium || undefined;
        traits.last_touch_campaign = last.utm.campaign || undefined;
        traits.last_touch_term = last.utm.term || undefined;
        traits.last_touch_content = last.utm.content || undefined;
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
        traits.utm_source = t0.utm.source || undefined;
        traits.utm_medium = t0.utm.medium || undefined;
        traits.utm_campaign = t0.utm.campaign || undefined;
        traits.utm_term = t0.utm.term || undefined;
        traits.utm_content = t0.utm.content || undefined;
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

    // Call like: SegmentClient.setConsent({ email, optedIn, source: 'convertflow_form' })
    // Alex - all of these are default values except email + optedIn - so can leave blank
    /*
    Can use like:
    window.addEventListener('cfSubmit', function (e) {
      const d = e.detail || {};
      if (d.step_name !== 'Email Form') return;

      SegmentClient.setConsent({
        email: (d.fields?.email || '').trim() || null,
        optedIn: !!d.fields?.email_opt_in,   // your CF opt-in checkbox field
        source: 'convertflow_form',
        jurisdiction: 'UK-PECR/GDPR',
        extraTraits: {
          // anything else you want attached at this moment
          form_variant: d.variant,
          collected_flow: d.cta?.name
        }
      });

      Or more simply:
      SegmentClient.setConsent({
        email: (d.fields?.email || '').trim() || null,
        optedIn: !!d.fields?.email_opt_in,
      });
    });
    */

    setConsent({
      email = null,
      optedIn = null,                 // true | false | null (no change)
      channel = 'email',
      source = 'convertflow_form',
      jurisdiction = 'UK-PECR/GDPR',
      extraTraits = {}
    } = {}) {
      const userId = (typeof email === 'string' && email.trim()) ? email.trim() : null;

      // Read previous traits (best-effort)
      let prevStatus = null;
      let prevConsents = null;
      try {
        const u = window.analytics?.user?.();
        const t = u ? (typeof u.traits === 'function' ? u.traits() : u.traits) : null;
        prevConsents = (t && t.consents) || null;
        prevStatus = prevConsents?.[channel]?.status || null; // 'subscribed' | 'unsubscribed' | 'never_subscribed' | null
      } catch (_) {}

      // Decide next status
      let nextStatus;
      if (optedIn === true) {
        nextStatus = 'subscribed';
      } else if (optedIn === false) {
        // Do not auto-downgrade a subscribed user
        nextStatus = (!prevStatus || prevStatus === 'never_subscribed') ? 'never_subscribed' : prevStatus;
      } else {
        // optedIn === null → no change intended
        nextStatus = prevStatus || 'never_subscribed';
      }

      // If nothing changed and no new email and no extra traits → skip
      const statusChanged = nextStatus !== prevStatus;
      const hasNewEmail = !!userId && !prevStatus; // treat first-time identify with email as meaningful
      const hasExtras = extraTraits && Object.keys(extraTraits).length > 0;

      if (!statusChanged && !hasNewEmail && !hasExtras) {
        if (this.debug) console.log('[SegmentClient] setConsent: no-op (no change)');
        return false;
      }

      // Merge consents object so we don't wipe other channels
      const mergedConsents = {
        ...(prevConsents || {}),
        [channel]: {
          status: nextStatus,
          collected_at: new Date().toISOString(),
          collected_from: source,
          jurisdiction
        }
      };

      const traits = { consents: mergedConsents, ...extraTraits };

      // Send via wrapper (queues if analytics not ready)
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
SegmentClient.init({ debug: true });
SegmentClient.storeTouch();
