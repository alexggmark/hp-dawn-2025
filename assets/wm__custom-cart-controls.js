/* -------------------------------------------------
  ADD TO CART AND APPLY DISCOUNT BASED ON UTM IN URL
------------------------------------------------- */
(() => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const raw = url.searchParams.get('add_to_cart'); // e.g. ?add_to_cart=41562314506379:1,40941346029707:1
  const discountCode = url.searchParams.get('discount'); // optional: ?discount=PEPTIDES90
  if (!raw) return;

  console.log(`Add to cart: ${raw}${discountCode ? ` (with discount ${discountCode})` : ''}`);

  // Parse "id" or "id:qty" tokens, keep order, de-dupe by id (first wins)
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
    url.searchParams.delete('discount');
    history.replaceState({}, '', url.toString());
    return;
  }

  // remove all this stuff from URL bar so people dont accidentally reload offer
  const cleanUp = () => {
    url.searchParams.delete('add_to_cart');
    url.searchParams.delete('discount');
    history.replaceState({}, '', url.toString());
  };

  // --- utilities ---
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const waitFor = async (check, { tries = 40, interval = 100 } = {}) => {
    for (let i = 0; i < tries; i++) {
      const val = check();
      if (val) return val;
      await sleep(interval);
    }
    return null;
  };

  // Apply /discount/<CODE> silently in a hidden iframe
  const applyDiscountSilently = (code, { timeoutMs = 2500 } = {}) => {
    return new Promise((resolve) => {
      if (!code) return resolve(false);

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';

      const cleanup = () => {
        try { iframe.removeEventListener('load', onLoad); } catch (_) {}
        try { iframe.remove(); } catch (_) {}
      };

      const onLoad = () => {
        cleanup();
        resolve(true);
      };

      const t = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);

      iframe.addEventListener('load', () => {
        clearTimeout(t);
        onLoad();
      });

      // Bounce back to current page inside the iframe so session gets set quickly
      const back = location.pathname + location.search + location.hash;
      iframe.src = `/discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(back)}`;
      document.body.appendChild(iframe);
    });
  };

  // Monster function with a bunch of waits in place
  const monsterAdd = async ({ id, quantity }, openDrawer) => {
    const fn = await waitFor(() => window?.monster_addToCart, { tries: 40, interval: 100 });
    if (typeof fn !== 'function') {
      throw new Error('monster_addToCart not available');
    }
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

  // fallback to cart URL if not working (not good, goes straight to checkout)
  const hardFallbackToCartUrl = (list) => {
    const path = list.map(({ id, quantity }) => `${id}:${quantity}`).join(',');
    location.assign(`/cart/${encodeURIComponent(path)}`);
  };

  (async () => {
    try {
      openGlobalModal(true, 'promo');

      if (discountCode) {
        const applied = await applyDiscountSilently(discountCode);
        console.log('Discount silently applied?', applied);
        // tiny pause helps if Monsterccart app "reloads" for some reason
        await sleep(150);
      }

      await addAllSequentially(items);

      // Alex note: you should open cart drawer here if not opened earlier for some reason
    } catch (err) {
      console.error('Param add_to_cart/discount flow failed:', err);
      // FIXME: turning off for now, not much utility
      // hardFallbackToCartUrl(items);
    } finally {
      openGlobalModal(false);
      cleanUp();
    }
  })();
})();

function openGlobalModal(toggle, content) {
  const open = toggle === true;
  const modal = document.querySelector('.global-modal');

  if (!modal) return;

  open ? modal.show(content) : modal.hide();
  // open && modal.show(content);
}
