(() => {
  if (typeof window === 'undefined') return;

  if (x != true) return; // blocker

  const url = new URL(window.location.href);
  const raw = url.searchParams.get('add_to_cart');
  if (!raw) return;

  const dedupeKey = `param:add:${raw}`;
  if (sessionStorage.getItem(dedupeKey)) {
    url.searchParams.delete('add_to_cart');
    history.replaceState({}, '', url.toString());
    return;
  }

  const ids = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => Number.isInteger(n) && n > 0);

  // Unique while preserving order
  const seen = new Set();
  const uniqueIds = ids.filter(id => (seen.has(id) ? false : (seen.add(id), true)));

  if (uniqueIds.length === 0) {
    url.searchParams.delete('add_to_cart');
    history.replaceState({}, '', url.toString());
    return;
  }

  /*
  const openCartUI = () => {
    const drawer = document.querySelector('cart-drawer');
    const notif = document.querySelector('cart-notification');
    if (drawer && typeof drawer.open === 'function') {
      drawer.open();
    } else if (notif && typeof notif.renderContents === 'function') {
      notif.classList.add('active');
    } else {
      location.assign('/cart');
    }
  };
  */

  const cleanUp = () => {
    sessionStorage.setItem(dedupeKey, '1');
    url.searchParams.delete('add_to_cart');
    history.replaceState({}, '', url.toString());
  };

  // Try batch add first
  const items = uniqueIds.map(id => ({ id, quantity: 1 }));

  fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ items })
  })
    .then(async r => {
      if (r.ok) return r.json();

      // If batch fails (e.g., one invalid ID), try per-item fallback
      const results = await Promise.allSettled(
        uniqueIds.map(id =>
          fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ id, quantity: 1 })
          })
        )
      );

      // If all failed, throw to hit global catch
      const anyFulfilled = results.some(res => res.status === 'fulfilled' && res.value.ok);
      if (!anyFulfilled) {
        const text = await r.text().catch(() => '');
        throw new Error(text || 'Batch add failed');
      }
    })
    .then(() => {
      openCartUI();
    })
    .catch(err => {
      console.error('Param add_to_cart failed:', err);
      // Last resort: go to cart
      location.assign('/cart');
    })
    .finally(() => {
      cleanUp();
    });
})();
