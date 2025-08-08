// Alex - storing in 'window' so accessible everywhere, from HTML <script> tags to injected ConvertFlow sections!

window.SegmentClient = {
  debug: false,
  traits: {},

  setTrait(key, value) {
    this.traits[key] = value;
    this._saveToLocal();
    if (this.debug) {
      console.log(`[SegmentClient] Queued trait: ${key} =`, value);
    }
  },

  trackEvent(name, props = {}) {
    if (typeof analytics == 'undefined') {
      console.warn('Analytics not ready');
      return;
    }

    analytics.track(name, props);
    if (this.debug) {
      console.log(`[SegmentClient] Tracked event: ${name}`, props);
    }
  },

  flushTraitsAndIdentify(userId, extraTraits = {}) {
    const stored = this._getFromLocal();
    const mergedTraits = this._cleanTraits({
      ...stored,
      ...this.traits,
      ...extraTraits
    });

    if (typeof analytics == 'undefined') return;

    analytics.identify(userId, mergedTraits);

    if (this.debug) {
      console.log(`[SegmentClient] Called identify: ${userId}`, mergedTraits);
    }

    this._clearLocal();
    this.traits = {};
  },

  storeFirstTouch() {
    if (localStorage.getItem('segment_first_touch_stored')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const utm_source = urlParams.get('utm_source');
    const utm_campaign = urlParams.get('utm_campaign');
    const referrer = document.referrer || null;
    const firstSeenUrl = window.location.href;

    if (utm_source) this.setTrait('utm_source', utm_source);
    if (utm_campaign) this.setTrait('utm_campaign', utm_campaign);
    if (referrer) this.setTrait('referrer', referrer);
    this.setTrait('first_seen_url', firstSeenUrl);

    localStorage.setItem('segment_first_touch_stored', 'true');

    if (this.debug) {
      console.log('[SegmentClient] First touch data stored');
    }
  },

  _cleanTraits(rawTraits) {
    const cleaned = {};
    Object.entries(rawTraits).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== 'null') {
        cleaned[key] = value;
      }
    });
    return cleaned;
  },

  _saveToLocal() {
    localStorage.setItem('segment_queued_traits', JSON.stringify(this.traits));
  },

  _getFromLocal() {
    try {
      return JSON.parse(localStorage.getItem('segment_queued_traits') || '{}');
    } catch (e) {
      return {};
    }
  },

  _clearLocal() {
    localStorage.removeItem('segment_queued_traits');
    localStorage.removeItem('segment_first_touch_stored');
  }
};
