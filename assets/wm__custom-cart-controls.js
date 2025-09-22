(() => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const raw = url.searchParams.get('add_to_cart'); // ?add_to_cart=41562314506379:1,40941346029707:1
  if (!raw) return;

  console.log(`Add to cart: ${raw}`);

  // Could use cookies to prevent multiple adds, but probably not useful right now
  /*
  const dedupeKey = `param:add:${raw}`;
  if (sessionStorage.getItem(dedupeKey)) {
    url.searchParams.delete('add_to_cart');
    history.replaceState({}, '', url.toString());
    return;
  }
  */

  // splitting up url params based on "," and ":" - maybe cleaner way to do this
  const seen = new Set();
  const items = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(token => {
      const [idStr, qtyStr] = token.split(':').map(t => t.trim());
      const id = Number(idStr);
      const quantity = Math.max(1, Number(qtyStr || 1) || 1);
      return { id, quantity };
    })
    .filter(({ id }) => Number.isInteger(id) && id > 0)
    .filter(({ id }) => (seen.has(id) ? false : (seen.add(id), true)));

  if (items.length === 0) {
    url.searchParams.delete('add_to_cart');
    history.replaceState({}, '', url.toString());
    return;
  }

  const cleanUp = () => {
    // turning off cookies for now, no real risk of multiple adds
    // sessionStorage.setItem(dedupeKey, '1');
    url.searchParams.delete('add_to_cart');
    history.replaceState({}, '', url.toString());
  };

  // small utilities
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const waitFor = async (check, { tries = 40, interval = 100 } = {}) => {
    for (let i = 0; i < tries; i++) {
      const val = check();
      if (val) return val;
      await sleep(interval);
    }
    return null;
  };

  const monsterAdd = async ({ id, quantity }, openDrawer) => {
    // double check (with wait) if function exists in code
    const fn = await waitFor(() => window?.monster_addToCart, { tries: 40, interval: 100 });
    if (typeof fn !== 'function') {
      throw new Error('monster_addToCart not available');
    }

    // small wait to fix monster freaking out about multiple calls
    await sleep(100);

    return new Promise((resolve, reject) => {
      try {
        fn({ id, quantity }, !!openDrawer, () => resolve());
      } catch (err) {
        reject(err);
      }
    });
  };

  const addAllSequentially = async (list) => {
    for (let i = 0; i < list.length; i++) {
      const isLast = i === list.length - 1;
      await monsterAdd(list[i], isLast);
    }
  };


  // fallback, but this goes straight to checkout
  const hardFallbackToCartUrl = (list) => {
    const path = list.map(({ id, quantity }) => `${id}:${quantity}`).join(',');
    location.assign(`/cart/${encodeURIComponent(path)}`);
  };

  (async () => {
    try {
      await addAllSequentially(items);
    } catch (err) {
      console.error('Param add_to_cart via Monster failed:', err);
      hardFallbackToCartUrl(items);
    } finally {
      cleanUp();
    }
  })();
})();