/* Alex's SegmentClient object
  (Note: this is for safely sending analytics.track() and .identify() events without confusion; we use cookies to be safer)
  - "First touch flag" used so we can track first interaction
  - "Traits" are what gets attached to user profiles in Segment - sent using analytics.identify()
  - "Events" are just quick notes attached to user account (less permanent than Traits) - send using analytics.track()
  - "cleanTraits()" - removing blank entries in object before pushing to Segment
*/

(function (w) {
  if (!w) return;

  const NS = 'segment_client_v1';
  const KEYS = {
    TRAITS: `${NS}__queued_traits`,
    FIRST_TOUCH_FLAG: `${NS}__first_touch_stored`,
  };

  // Safe storage helpers (no-throw)
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
      try {
        w.localStorage.setItem(key, JSON.stringify(val));
      } catch (_) {}
    },
    remove(key) {
      try {
        w.localStorage.removeItem(key);
      } catch (_) {}
    },
  };

  // ---- Cleaning ----
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
      w.analytics.track(name, p);
      if (this.debug) console.log('[SegmentClient] track', name, p);
    },

    /*
      🟢 USAGE --> identify()
      SegmentClient.flushTraitsAndIdentify(data.fields.email, {
        ...window.quizAnswers
      });
    */
    flushTraitsAndIdentify(userId, extraTraits = {}) {
      const stored = storage.get(KEYS.TRAITS, {});
      const merged = cleanTraits({ ...stored, ...this.traits, ...extraTraits });

      if (typeof userId !== 'string' || !userId.trim()) {
        if (this.debug) console.warn('[SegmentClient] identify skipped: missing userId');
        return;
      }

      if (typeof w.analytics === 'undefined') {
        if (this.debug) console.warn('[SegmentClient] analytics not ready: identify skipped');
        return;
      }

      w.analytics.identify(userId.trim(), merged);
      if (this.debug) console.log('[SegmentClient] identify', userId, merged);

      this.traits = {};
      storage.remove(KEYS.TRAITS);
    },

    /*
      First touch:
      - Bail if local flag exists
      - If profile already has first_touch_at, mirror flag locally and bail
      - Else build payload, persist locally, and SEND via identify:
          • identified if a userId exists
          • otherwise anonymous identify(payload)
      - Only set local flag after the identify call is attempted
    */
    storeFirstTouch() {
      // 1) Device-level bail.
      if (storage.get(KEYS.FIRST_TOUCH_FLAG, null)) return;

      const run = () => {
        // Ensure analytics exists; if not, retry briefly.
        if (!w.analytics) {
          setTimeout(run, 250);
          return;
        }

        // 2) Check current profile traits (anonymous or identified).
        const u = (typeof w.analytics.user === 'function') ? w.analytics.user() : null;
        const traits = u ? (typeof u.traits === 'function' ? u.traits() : u.traits) : null;

        // If first_touch already exists on profile, mirror locally and stop.
        if (traits && (traits.first_touch_at || traits.firstTouchAt)) {
          storage.set(KEYS.FIRST_TOUCH_FLAG, { mirrored: true, at: Date.now() });
          if (SegmentClient.debug) console.log('[SegmentClient] first touch exists on profile, mirrored');
          return;
        }

        // 3) Build payload, persist locally, and send identify (anon or identified).
        const qp = new URL(w.location.href).searchParams;
        const payload = cleanTraits({
          first_touch_at: new Date().toISOString(),
          utm_source: qp.get('utm_source'),
          utm_medium: qp.get('utm_medium'),
          utm_campaign: qp.get('utm_campaign'),
          utm_term: qp.get('utm_term'),
          utm_content: qp.get('utm_content'),
          referrer: document.referrer || undefined,
          first_touch_url: w.location.href
        });

        // Save to local traits so it's included in your next identify as well
        SegmentClient.setTraits(payload);

        try {
          // If already identified, send with id; otherwise anonymous identify
          const id = u ? (typeof u.id === 'function' ? u.id() : u.id) : null;
          if (id) {
            if (SegmentClient.debug) console.log('Running firstTouch identify - with user ID');
            w.analytics.identify(id, payload);
          } else {
            if (SegmentClient.debug) console.log('Running firstTouch identify - without user ID');
            w.analytics.identify(payload);
          }

          // Mark success (prevents re-sending next page)
          storage.set(KEYS.FIRST_TOUCH_FLAG, { storedAt: Date.now() });
          if (SegmentClient.debug) {
            console.log('[SegmentClient] first touch identify sent', id ? '(identified)' : '(anonymous)', payload);
          }
        } catch (e) {
          if (SegmentClient.debug) console.warn('[SegmentClient] first touch identify failed; will retry', e);
          // Do NOT set the flag; we'll try again on a later page.
        }
      };

      // 4) Prefer Segment's ready hook; otherwise schedule soon.
      if (w.analytics && typeof w.analytics.ready === 'function') {
        w.analytics.ready(run);
      } else if ('requestIdleCallback' in w) {
        w.requestIdleCallback(run, { timeout: 1000 });
      } else {
        setTimeout(run, 0);
      }
    },

    // Clear everything (local)
    reset() {
      this.traits = {};
      storage.remove(KEYS.TRAITS);
      storage.remove(KEYS.FIRST_TOUCH_FLAG);
      if (this.debug) console.log('[SegmentClient] reset');
    }
  };

  w.SegmentClient = SegmentClient;
})(typeof window !== 'undefined' ? window : null);

// Initialize + run on every page
SegmentClient.init({ debug: true });
SegmentClient.storeFirstTouch();
