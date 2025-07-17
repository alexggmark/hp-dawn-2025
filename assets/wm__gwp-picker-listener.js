function monsterAddToCartPromise(variantId, openCart = false) {
  return new Promise((resolve, reject) => {
    window.monster_addToCart(
      {
        id: parseInt(variantId),
        quantity: 1,
        properties: { _gwp: "true" }
      },
      openCart,
      () => {
        console.log("Added:", variantId);
        setTimeout(resolve, 100); // allow time for MonsterCart to process
      }
    );
  });
}

function monsterRemoveFromCartPromise(line) {
  return new Promise((resolve) => {
    window.monster_updateCartItem(
      {
        line: line,
        quantity: 0
      },
      false,
      () => {
        console.log("Removed GWP at line:", line);
        setTimeout(resolve, 100);
      }
    );
  });
}

async function checkAndInjectGWPs() {
  const gwpVariants = JSON.parse(localStorage.getItem("gwp_selected") || "[]");
  const discountCode = localStorage.getItem("gwp_discount_code");

  console.log(gwpVariants);
  console.log(discountCode);

  if (!gwpVariants.length || !discountCode) return;

  console.log("CART UPDATE");

  try {
    const res = await fetch("/cart.js");
    const cart = await res.json();

    const subtotal = cart.items_subtotal_price / 100;

    const alreadyHasGwp = cart.items.some(
      item => item.properties && item.properties._gwp === "true"
    );

    if (subtotal >= 90 && !alreadyHasGwp) {
      console.log("Injecting GWPs based on cookie");

      await monsterAddToCartPromise(gwpVariants[0], false);
      await monsterAddToCartPromise(gwpVariants[1], true); // open drawer after second add

      await fetch(`/discount/${encodeURIComponent(discountCode)}`);

      localStorage.removeItem("gwp_selected");
      localStorage.removeItem("gwp_discount_code");
    } else {
      console.log("Removing GWP items due to low subtotal or already injected");

      for (const item of gwpItemsInCart) {
        await monsterRemoveFromCartPromise(item.line);
      }
      localStorage.removeItem("gwp_selected");
      localStorage.removeItem("gwp_discount_code");
    }
  } catch (err) {
    console.error("Error checking or injecting GWPs:", err);
  }
}

window.addEventListener("DOMContentLoaded", checkAndInjectGWPs);
document.addEventListener("cart:updated", checkAndInjectGWPs);
// document.addEventListener("cart:updated", () => {
//   console.log("UPDATEDUPDATED UPDATED")
// });