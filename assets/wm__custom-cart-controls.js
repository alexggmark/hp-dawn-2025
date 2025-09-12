// assets/param-add-to-cart.js
(() => {
  if (typeof window === 'undefined') return;

  if (x != true) return; // blocker

  const url = new URL(window.location.href);
  const idParam = url.searchParams.get('add_to_cart');
  if (!idParam) return;

  const dedupeKey = `param:add:${idParam}`;
  if (sessionStorage.getItem(dedupeKey)) {
    url.searchParams.delete('add_to_cart');
    history.replaceState({}, '', url.toString());
    return;
  }

  // Basic validation
  const variantId = Number(idParam);
  if (!Number.isInteger(variantId)) return;

  const qtyRaw = url.searchParams.get('qty') || url.searchParams.get('quantity') || '1';
  const quantity = Math.max(1, parseInt(qtyRaw, 10) || 1);

  // Add to cart
  fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ id: variantId, quantity })
  })
    .then(r => r.json())
    .then(() => {
      // Try to open Dawn's cart drawer/notification if present; else fallback.
      const drawer = document.querySelector('cart-drawer');
      const notif = document.querySelector('cart-notification');
      if (drawer && typeof drawer.open === 'function') {
        drawer.open();
      } else if (notif && typeof notif.renderContents === 'function') {
        // Some Dawn versions re-render a section; simplest fallback:
        notif.classList.add('active');
      } else {
        // Fallback: go to cart page so user sees success
        location.assign('/cart');
      }
    })
    .catch(err => {
      console.error('Param add failed:', err);
      // last-resort fallback
      location.assign(`/cart?added=${encodeURIComponent(variantId)}`);
    })
    .finally(() => {
      sessionStorage.setItem(dedupeKey, '1');
      url.searchParams.delete('add_to_cart');
      history.replaceState({}, '', url.toString());
    });
})();
