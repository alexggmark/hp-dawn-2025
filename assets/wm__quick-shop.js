// This is a modification of "quick-add". The reason we're doing this is in case we need to change logic in fetch() to pull in something unique
// - We're also styling quick-shop as a drawer instead of a modal, so it was useful to have custom "quick-shop-drawer" name for CSS
// - "QuickShopOpener" might be unnecessary as it's just a clone of "ModalOpener", but you never know if we need to change something

if (!customElements.get('quick-shop-opener')) {
  customElements.define(
    'quick-shop-opener',
    class QuickShopOpener extends HTMLElement {
      constructor() {
        super();

        const button = this.querySelector('button');

        if (!button) return;
        button.addEventListener('click', () => {
          const modal = document.querySelector(this.getAttribute('data-modal'));
          if (modal) modal.show(button);
        });
      }
    }
  );
}

if (!customElements.get('quick-shop-drawer')) {
  customElements.define(
    'quick-shop-drawer',
    class QuickShopDrawer extends DrawerDialog {
      constructor() {
        super();
        this.modalContent = this.querySelector('[id^="QuickShopInfo-"]');
        this.quickShopCTA = null;
        // Alex - using this to store quantity input
        this.quantityCounter = 1;

        this.addEventListener('product-info:loaded', ({ target }) => {
          target.addPreProcessCallback(this.preprocessHTML.bind(this));
        });
        // Alex - manually listening for quantity change and updating counter if right input
        this.addEventListener('change', (e) => {
          if (e.target.type !== 'number' && !e.target.getAttribute('data-cart-quantity')) return;
          this.quantityCounter = e.target.value;
        });
      }

      hide(preventFocus = false) {
        const cartNotification = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        if (cartNotification) cartNotification.setActiveElement(this.openedBy);
        // Any issues not removing this? It means keeping quick-shop content after closing drawer
        // this.modalContent.innerHTML = '';
        
        if (preventFocus) this.openedBy = null;
        super.hide();
      }

      show(opener) {
        opener.setAttribute('aria-disabled', true);
        opener.classList.add('loading');
        opener.querySelector('.loading__spinner').classList.remove('hidden');

        fetch(opener.getAttribute('data-product-url'))
          .then((response) => response.text())
          .then((responseText) => {
            const responseHTML = new DOMParser().parseFromString(responseText, 'text/html');
            const productElement = responseHTML.querySelector('product-info');

            this.preprocessHTML(productElement);
            HTMLUpdateUtility.setInnerHTML(this.modalContent, productElement.outerHTML);

            if (window.Shopify && Shopify.PaymentButton) {
              Shopify.PaymentButton.init();
            }
            if (window.ProductModel) window.ProductModel.loadShopifyXR();

            super.show(opener);
          })
          .finally(() => {
            opener.removeAttribute('aria-disabled');
            opener.classList.remove('loading');
            opener.querySelector('.loading__spinner').classList.add('hidden');
            
            // Alex - adding in new logic to re-apply Monster Cart logic to CTAs inside quick shop modal
            // Remove this to default to standard logic
            this.quickShopCTA = this.querySelector('[id^="ProductSubmitButton-quickshop-template-"]');
            this.quickShopCTA.addEventListener('click', (e) => this.monsterCartFunction(e));
          });
      }

      // Alex - preventing "Add To Cart" click and manually sending data to Monster Cart
      // This is because otherwise it redirects to /cart/ page even if deactivated
      // This is BECAUSE Monster Cart doesn't dynamically re-apply logic to dynamically loaded CTAs (quick shop)
      async monsterCartFunction(e) {
        if (typeof window.monster_addToCart !== 'function') return;
        
        e.preventDefault();

        const quickShopCTA = e.currentTarget;
        const id = this.querySelector('.product-variant-id').getAttribute('value');
        const quantity = this.quantityCounter;

        quickShopCTA.setAttribute('aria-disabled', true);
        quickShopCTA.classList.add('loading');
        quickShopCTA.querySelector('.loading__spinner').classList.remove('hidden');

        try {
          await new Promise((resolve, reject) => {
            try {
              window.monster_addToCart({ id, quantity }, true, () => {
                super.hide();
                resolve(); // resolves when callback is triggered
              });
            } catch (err) {
              reject(err); // catches sync errors inside monster_addToCart
            }
          });
        } catch (e) {
          console.error(e);
        } finally {
          quickShopCTA.removeAttribute('aria-disabled');
          quickShopCTA.classList.remove('loading');
          quickShopCTA.querySelector('.loading__spinner').classList.add('hidden');
        }

      }

      preprocessHTML(productElement) {
        productElement.classList.forEach((classApplied) => {
          if (classApplied.startsWith('color-') || classApplied === 'gradient')
            this.modalContent.classList.add(classApplied);
        });
        // this.repositionElements(productElement);
        this.preventDuplicatedIDs(productElement);
        this.removeDOMElements(productElement);
        this.removeExtraDOMElements(productElement);
        this.removeGalleryListSemantic(productElement);
        this.updateImageSizes(productElement);
        this.preventVariantURLSwitching(productElement);
      }

      preventVariantURLSwitching(productElement) {
        productElement.setAttribute('data-update-url', 'false');
      }

      removeDOMElements(productElement) {
        const pickupAvailability = productElement.querySelector('pickup-availability');
        if (pickupAvailability) pickupAvailability.remove();

        const productModal = productElement.querySelector('product-modal');
        if (productModal) productModal.remove();

        const modalDialog = productElement.querySelectorAll('modal-dialog');
        if (modalDialog) modalDialog.forEach((modal) => modal.remove());
      }

      // TODO: use this to remove excess elements
      removeExtraDOMElements(productElement) {
        const pageWidthElements = productElement.querySelector('.page-width');
        if (pageWidthElements) pageWidthElements.classList.remove('page-width');

        const productUSPSBlock = productElement.querySelector('[data-js-product-usps]');
        if (productUSPSBlock) productUSPSBlock.remove();

        const productToplineBlock = productElement.querySelector('[data-js-topline-callout]');
        if (productToplineBlock) productToplineBlock.remove();

        const productDetailsBlock = productElement.querySelectorAll('[data-js-product-details]');
        if (productDetailsBlock) productDetailsBlock.forEach((details) => details.remove());
      }

      preventDuplicatedIDs(productElement) {
        const sectionId = productElement.dataset.section;

        const oldId = sectionId;
        const newId = `quickshop-${sectionId}`;
        productElement.innerHTML = productElement.innerHTML.replaceAll(oldId, newId);
        Array.from(productElement.attributes).forEach((attribute) => {
          if (attribute.value.includes(oldId)) {
            productElement.setAttribute(attribute.name, attribute.value.replace(oldId, newId));
          }
        });

        productElement.dataset.originalSection = sectionId;
      }

      removeGalleryListSemantic(productElement) {
        const galleryList = productElement.querySelector('[id^="Slider-Gallery"]');
        if (!galleryList) return;

        galleryList.setAttribute('role', 'presentation');
        galleryList.querySelectorAll('[id^="Slide-"]').forEach((li) => li.setAttribute('role', 'presentation'));
      }

      updateImageSizes(productElement) {
        const product = productElement.querySelector('.product');
        const desktopColumns = product?.classList.contains('product--columns');
        if (!desktopColumns) return;

        const mediaImages = product.querySelectorAll('.product__media img');
        if (!mediaImages.length) return;

        let mediaImageSizes =
          '(min-width: 1000px) 715px, (min-width: 750px) calc((100vw - 11.5rem) / 2), calc(100vw - 4rem)';

        if (product.classList.contains('product--medium')) {
          mediaImageSizes = mediaImageSizes.replace('715px', '605px');
        } else if (product.classList.contains('product--small')) {
          mediaImageSizes = mediaImageSizes.replace('715px', '495px');
        }

        mediaImages.forEach((img) => img.setAttribute('sizes', mediaImageSizes));
      }
    }
  );
}
