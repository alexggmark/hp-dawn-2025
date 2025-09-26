analytics.ready(() => {
  return; // pausing this until we know it's fully working ❌
  const anonId = analytics.user().anonymousId();
  console.log(anonId);
  const url = `https://segment-endpoint-hp.vercel.app/api/hydropeptide?anonymousId=${encodeURIComponent(anonId)}&trait=consents`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      console.log("Trait response:", data);

      // Example: check if consents is true
      if (data?.results?.consents?.value.email.status) {
        console.log(`User has given consent ✅: ${data.results.consents.value.email.status}`);
      } else {
        console.log("No consent or trait missing ❌");
      }
    })
    .catch(err => {
      console.error("Error fetching trait:", err);
    });
});

// Shouldn't hit endpoint until we're absolutely sure we want it to run
// Will either do aspirational or affluent based on user traits

// Check if aspirational, if so return; then check if affluent, if so return

async function checkAffluentAspirational(anonId) {
  const url = `https://segment-endpoint-hp.vercel.app/api/hydropeptide?anonymousId=${encodeURIComponent(anonId)}&traits=is_affluent,is_aspirational`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Trait response:", data);

    return data?.results;
  } catch (err) {
    console.error("Error fetching trait:", err);
    return false; // safe fallback
  }
}

(function (w) {
  if (!w) return;

  const NS = 'convertflow_trigger';
  const KEYS = {
    CLOSED_AFFLUENT_QUIZ: `${NS}__closed_affluent_quiz`
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

  w.analytics.ready(async () => {
    const anonId = analytics.user().anonymousId()
    const userId = analytics.user().id()

    if (userId) {
      console.log("User already identified");
      return;
    }

    if (!anonId) {
      console.log("No anonymous ID");
      return;
    }

    // ---------- Affluent/aspirational popup controls ----------

    if (!(analytics.user().traits().is_affluent() || analytics.user().traits().is_aspirational())) {
      const affluentAspirational = await checkAffluentAspirational(anonId);
  
      if (affluentAspirational?.is_affluent?.value) {
        // launch affluent popup
        return;
      }
  
      if (affluentAspirational?.is_aspirational?.value) {
        // launch aspirational popup
        return;
      }
    }

  });

  // Run an identify call at some stage to store results

})(typeof window !== 'undefined' ? window : null);

/*
(() => {
  const OFFERS = [
    {
      id: 'affluent_quiz',
      enabled: true,
      selector: '.js-open-cf-affluent',
      trait: [
        { type: 'trait', key: 'isAffluent', equals: true }
      ],
      cooldownDaysAfterClose: 7,
      cooldownDaysAfterComplete: 180,
      oncePerSession: true
    }
  ];

  // ----------------- Small helpers -----------------
  const storage = {
    get(n) {
      return document.cookie.split('; ').find(r => r.startsWith(n+'='))?.split('=')[1] || null;
    },
    set(n, v, days) {
      const d = new Date(); d.setDate(d.getDate() + (days || 365));
      document.cookie = `${n}=${v}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
    }
  };
  const sessionMark = {
    has(n) { return sessionStorage.getItem(n) === '1'; },
    set(n) { sessionStorage.setItem(n, '1'); }
  };
  const waitFor = (test, {tries=50, interval=100}={}) => new Promise((res, rej) => {
    let n=0; const t=setInterval(() => {
      try { const ok = test(); if (ok) { clearInterval(t); return res(ok); } } catch {}
      if (++n>=tries) { clearInterval(t); rej(new Error('waitFor timeout')); }
    }, interval);
  });

  // ----------------- Segment trait access (simple) -----------------
  function getSegmentTraitsSafe() {
    try {
      const u = window.analytics?.user?.();
      return u?.traits?.() || null;
    } catch { return null; }
  }
  function traitMatches(traits, {key, equals}) {
    if (!traits) return false;
    // support a couple of common keys you might use interchangeably
    const val = (key in traits) ? traits[key]
              : (key === 'isAffluent' && 'affluent' in traits ? traits.affluent : undefined);
    return equals === undefined ? !!val : val === equals;
  }

  // ----------------- ConvertFlow suppression via events -----------------
  let lastTriggeredOfferId = null;

  // When a popup is closed/submitted, set suppression cookie for the last triggered offer
  window.addEventListener('cfClose', () => {
    if (!lastTriggeredOfferId) return;
    const offer = OFFERS.find(o => o.id === lastTriggeredOfferId);
    if (offer) storage.set(`offer_sup_${offer.id}`, '1', offer.cooldownDaysAfterClose || 1);
  });
  window.addEventListener('cfCompletion', () => {
    if (!lastTriggeredOfferId) return;
    const offer = OFFERS.find(o => o.id === lastTriggeredOfferId);
    if (offer) storage.set(`offer_sup_${offer.id}`, '1', offer.cooldownDaysAfterComplete || (offer.cooldownDaysAfterClose || 7));
  });

  // ----------------- Core runner -----------------
  async function runOffers() {
    const traits = getSegmentTraitsSafe();
    // If Segment not ready/identified, you can bail silently
    if (!traits) return;

    for (const offer of OFFERS) {
      if (!offer.enabled) continue;

      // suppression
      if (offer.oncePerSession && sessionMark.has(`seen_${offer.id}`)) continue;
      if (storage.get(`offer_sup_${offer.id}`) === '1') continue;

      // eligibility
      if (offer.trait && !traitMatches(traits, offer.trait)) continue;

      // trigger
      const triggerEl = document.querySelector(offer.selector);
      if (!triggerEl) continue;

      // mark + click
      lastTriggeredOfferId = offer.id;
      sessionMark.set(`seen_${offer.id}`);
      triggerEl.click();

      // Fire only one offer per load by default
      break;
    }
  }

  // ----------------- Boot logic -----------------
  const kick = () => { try { runOffers(); } catch(e) {  } };

  // Run after DOM is there
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    queueMicrotask(kick);
  } else {
    document.addEventListener('DOMContentLoaded', kick, { once: true });
  }

  // Also run when Segment says it’s ready (traits populated after identify)
  if (window.analytics && typeof analytics.ready === 'function') {
    analytics.ready(kick);
  } else {
    // Fallback polling in case Segment loads a bit later
    waitFor(() => getSegmentTraitsSafe(), { tries: 30, interval: 200 }).then(kick).catch(()=>{});
  }

  // Optional: re-run on your signal
  document.addEventListener('offers:run', kick);
})();
*/