// Used to generate working "Add to Cart" when CTA rendered dynamically
async function globalMonsterCartFunction(event, variantId, product, quantity) {
  console.log("globalMonsterCartFunction");
  if (typeof window.monster_addToCart !== 'function') return;
  
  const CTA =
    event?.currentTarget
    || event?.target?.closest?.('[data-add-to-cart], button, [role="button"]')
    || null;

  console.log(CTA);

  if (event?.preventDefault) event.preventDefault();

  const id = variantId ? variantId : product.variants[0].id;

  console.log(id);

  CTA.setAttribute('aria-disabled', true);
  CTA.classList.add('loading');
  CTA.querySelector('.loading__spinner').classList.remove('hidden');

  await new Promise((resolve, reject) => {
    try {
      window.monster_addToCart({ id, quantity }, true, () => {
        resolve();
      });
    } catch (err) {
      reject(err);
    } finally {
      CTA.removeAttribute('aria-disabled');
      CTA.classList.remove('loading');
      CTA.querySelector('.loading__spinner').classList.add('hidden');
    }
  })
}

// Main carousel controller
class EmblaSlider extends HTMLElement {
  constructor() {
    super();
    this.embla = null;
    this.cleanupProgress = null;
    this.debounceTimeout = null;
    this.hasInitialised = false;
  }

  connectedCallback() {
    const isLazy = this.hasAttribute('data-lazy');

    if (!isLazy) {
      this.initSlider();
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          console.log("initSlider - lazy");
          this.initSlider();
          observer.unobserve(this);
        }
      });
    }, {
      rootMargin: '0px 0px 200px 0px',
      threshold: 0.1,
    });

    observer.observe(this)
  }

  initSlider() {
    if (this.hasInitialised) return;
    this.hasInitialised = true;

    const tabButtons = this.querySelectorAll('[data-js-collection-tab]');
    if (tabButtons.length > 0) this.setupTabs(tabButtons);
    this.setupEmbla();
  }

  disconnectedCallback() {
    if (this.embla) this.embla.destroy();
    if (this.cleanupProgress) this.cleanupProgress();
  }

  setupTabs(tabButtons) {
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const handle = button.getAttribute('data-js-collection-tab');

        tabButtons.forEach(btn => btn.classList.remove('tab-button--active'));
        button.classList.add('tab-button--active');
        
        if (handle) this.loadCollectionFromTemplate(handle);
      });
    });
  }

  loadCollectionFromTemplate(handle) {
    const container = this.querySelector('[data-js-embla-container]');
    const template = this.querySelector(`[data-js-product-card-template="${handle}"]`);

    if (!template || !container) {
      console.warn('Missing template or embla container');
      return;
    }

    const cloned = template.content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(cloned);

    if (this.embla) this.embla.destroy();
    if (this.cleanupProgress) this.cleanupProgress();

    this.setupEmbla();
  }

  setupEmbla() {
    const emblaNode = this.querySelector('[data-js-embla]');
    const emblaContainer = emblaNode?.querySelector('[data-js-embla-container]');
    const prevBtn = this.querySelector('[data-js-embla-prev]');
    const nextBtn = this.querySelector('[data-js-embla-next]');
    const progressBar = this.querySelector('[data-js-embla-progress]');

    if (!window.EmblaCarousel) {
      console.error("EmblaCarousel not loaded??");
      return;
    }

    if (!emblaNode || !emblaContainer) {
      console.error("missing  nodes");
      return;
    }

    const loop = this.getAttribute('data-loop') === 'true';
    const align = this.getAttribute('data-align') || 'start';
    const skipSnaps = this.getAttribute('data-skip-snaps') !== 'false';

    this.embla = EmblaCarousel(emblaNode, { loop, align, skipSnaps });

    const toggleButtons = () => {
      const canScrollPrev = this.embla.canScrollPrev();
      const canScrollNext = this.embla.canScrollNext();
      if (prevBtn) prevBtn.disabled = !canScrollPrev;
      if (nextBtn) nextBtn.disabled = !canScrollNext;
    };

    if (prevBtn) prevBtn.addEventListener('click', () => this.embla.scrollPrev());
    if (nextBtn) nextBtn.addEventListener('click', () => this.embla.scrollNext());

    this.embla.on('select', toggleButtons);
    this.embla.on('init', toggleButtons);
    toggleButtons();

    if (progressBar) {
      const updateProgress = () => {
        const raw = this.embla.scrollProgress();
        const clamped = Math.min(1, Math.max(0, raw));
        const percentage = (clamped * 100).toFixed(2);
        progressBar.style.width = `${percentage}%`;
      };

      const debouncedUpdate = () => {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = setTimeout(updateProgress, 16);
      };

      this.embla.on('scroll', debouncedUpdate);
      this.embla.on('reInit', updateProgress);
      progressBar.style.width = '0%';
      updateProgress();

      this.cleanupProgress = () => {
        clearTimeout(this.debounceTimeout);
        this.embla.off('scroll', debouncedUpdate);
        this.embla.off('reInit', updateProgress);
      };
    }
  }
}

customElements.define('embla-slider', EmblaSlider);

class AnimatedDetails extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.details = this.querySelector('details');
    this.summary = this.details?.querySelector('summary');
    this.content = this.details?.querySelector('details>div');
    // Alex - this only works with specific plus sign which has 2 paths, 1st being vertical line
    this.plusIcon = this.details?.querySelector('[data-js-plus-icon]');

    if (typeof window.Motion !== 'object' || typeof window.Motion.animate !== 'function') {
      console.error('[AnimatedDetails] Motion One is not loaded or unavailable.');
      return;
    }

    if (!this.details || !this.summary || !this.content) return;

    this.details.removeAttribute('open');
    this.content.style.overflow = 'hidden';
    this.content.style.opacity = 0;
    this.content.style.height = '0px';
    this.content.style.display = 'none';

    this.summary.addEventListener('click', (e) => {
      e.preventDefault();

      const isOpen = this.details.hasAttribute('open');

      if (isOpen) {
        if (this.plusIcon) this.plusIcon.querySelector('svg>path:first-child').style.opacity = 1;
        Motion.animate(this.content, {
          opacity: [1, 0],
          height: [`${this.content.scrollHeight}px`, '0px']
        }, {
          duration: 0.2,
          easing: 'ease-in'
        }).finished.then(() => {
          this.content.style.display = 'none';
          this.details.removeAttribute('open');
        });
      } else {
        if (this.plusIcon) this.plusIcon.querySelector('svg>path:first-child').style.opacity = 0;
        this.details.setAttribute('open', '');
        this.content.style.display = 'block';
        Motion.animate(this.content, {
          opacity: [0, 1],
          height: ['0px', `${this.content.scrollHeight}px`]
        }, {
          duration: 0.2,
          easing: 'ease-out'
        });
      }
    });
  }
}

customElements.define('animated-details', AnimatedDetails);

class AnimatedReadMore extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    if (typeof window.Motion !== 'object' || typeof window.Motion.animate !== 'function') {
      console.error('[AnimatedReadMore] Motion One not available.');
      return;
    }

    this.content = this.querySelector('[data-js-read-more-content]');
    this.button = this.querySelector('[data-js-read-more-button]');
    if (!this.content || !this.button) return;

    this.expanded = false;
    this.maxHeight = parseInt(this.dataset.maxHeight || 100, 10);

    // Only apply initial collapsed state if not already present
    const initialMaxHeight = parseInt(this.content.style.maxHeight, 10);
    if (isNaN(initialMaxHeight) || initialMaxHeight > this.maxHeight) {
      this.content.style.maxHeight = `${this.maxHeight}px`;
    }

    if (!this.content.classList.contains('mask-fade-bottom')) {
      this.content.classList.add('mask-fade-bottom');
    }

    if (this.content.style.overflow !== 'hidden') {
      this.content.style.overflow = 'hidden';
    }

    this.button.addEventListener('click', () => this.toggle());
  }

  toggle() {
    const content = this.content;

    this.expanded = !this.expanded;
    const targetHeight = this.expanded ? content.scrollHeight : this.maxHeight;

    if (this.expanded) {
      content.classList.remove('mask-fade-bottom');
    }

    Motion.animate(content, {
      maxHeight: [content.offsetHeight, targetHeight]
    }, {
      duration: 0.4,
      easing: 'ease-in-out',
    }).finished.then(() => {
      if (this.expanded) {
        content.style.maxHeight = 'none'; // allow natural flow
      } else {
        content.style.maxHeight = `${this.maxHeight}px`;
        content.classList.add('mask-fade-bottom');
      }
    });

    this.button.textContent = this.expanded ? 'Show less' : 'Read more';
  }
}

customElements.define('animated-read-more', AnimatedReadMore);

// Customised version of "menu-drawer" used for mobile collection filter/sort drawer
// Note: original used to extend for "header drawer" - so leave that alone, I might want to keep the animations in there
class WmMenuDrawer extends HTMLElement {
  constructor() {
    super();

    this.mainDetailsToggle = this.querySelector('details');

    this.addEventListener('keyup', this.onKeyUp.bind(this));
    this.addEventListener('focusout', this.onFocusOut.bind(this));
    this.bindEvents();
  }

  bindEvents() {
    this.querySelectorAll('summary').forEach((summary) =>
      summary.addEventListener('click', this.onSummaryClick.bind(this))
    );
    this.querySelectorAll(
      'button:not(.localization-selector):not(.country-selector__close-button):not(.country-filter__reset-button)'
    ).forEach((button) => button.addEventListener('click', this.onCloseButtonClick.bind(this)));
  }

  onKeyUp(event) {
    if (event.code.toUpperCase() !== 'ESCAPE') return;

    const openDetailsElement = event.target.closest('details[open]');
    if (!openDetailsElement) return;

    openDetailsElement === this.mainDetailsToggle
      ? this.closeMenuDrawer(event, this.mainDetailsToggle.querySelector('summary'))
      : this.closeSubmenu(openDetailsElement);
  }

  onSummaryClick(event) {
    const summaryElement = event.currentTarget;
    const detailsElement = summaryElement.parentNode;
    const parentMenuElement = detailsElement.closest('.js-has-submenu');
    const isOpen = detailsElement.hasAttribute('open');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function addTrapFocus() {
      trapFocus(summaryElement.nextElementSibling, detailsElement.querySelector('button'));
      summaryElement.nextElementSibling.removeEventListener('transitionend', addTrapFocus);
    }

    // The main drawer opening
    if (detailsElement === this.mainDetailsToggle) {
      if (isOpen) event.preventDefault();
      isOpen ? this.closeMenuDrawer(event, summaryElement) : this.openMenuDrawer(summaryElement);

      if (window.matchMedia('(max-width: 990px)')) {
        document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
      }
    // The detail/summary opening
    } else {
      setTimeout(() => {
        detailsElement.classList.add('menu-opening');
        summaryElement.setAttribute('aria-expanded', true);
        parentMenuElement && parentMenuElement.classList.add('submenu-open');
        !reducedMotion || reducedMotion.matches
          ? addTrapFocus()
          : summaryElement.nextElementSibling.addEventListener('transitionend', addTrapFocus);
      }, 100);
    }
  }

  openMenuDrawer(summaryElement) {
    setTimeout(() => {
      this.mainDetailsToggle.classList.add('menu-opening');
    });
    summaryElement.setAttribute('aria-expanded', true);
    trapFocus(this.mainDetailsToggle, summaryElement);
    document.body.classList.add(`overflow-hidden-${this.dataset.breakpoint}`);
  }

  closeMenuDrawer(event, elementToFocus = false) {
    if (event === undefined) return;

    this.mainDetailsToggle.classList.remove('menu-opening');
    this.mainDetailsToggle.querySelectorAll('details').forEach((details) => {
      // FIXME: see if this causes problem, forcing this to stay open
      // details.removeAttribute('open');
      details.classList.remove('menu-opening');
    });
    this.mainDetailsToggle.querySelectorAll('.submenu-open').forEach((submenu) => {
      submenu.classList.remove('submenu-open');
    });
    document.body.classList.remove(`overflow-hidden-${this.dataset.breakpoint}`);
    removeTrapFocus(elementToFocus);
    this.closeAnimation(this.mainDetailsToggle);

    if (event instanceof KeyboardEvent) elementToFocus?.setAttribute('aria-expanded', false);
  }

  onFocusOut() {
    setTimeout(() => {
      if (this.mainDetailsToggle.hasAttribute('open') && !this.mainDetailsToggle.contains(document.activeElement))
        this.closeMenuDrawer();
    });
  }

  onCloseButtonClick(event) {
    const detailsElement = event.currentTarget.closest('details');
    this.closeSubmenu(detailsElement);
  }

  closeSubmenu(detailsElement) {
    const parentMenuElement = detailsElement.closest('.submenu-open');
    parentMenuElement && parentMenuElement.classList.remove('submenu-open');
    detailsElement.classList.remove('menu-opening');
    detailsElement.querySelector('summary').setAttribute('aria-expanded', false);
    removeTrapFocus(detailsElement.querySelector('summary'));
    this.closeAnimation(detailsElement);
  }

  closeAnimation(detailsElement) {
    let animationStart;

    const handleAnimation = (time) => {
      if (animationStart === undefined) {
        animationStart = time;
      }

      const elapsedTime = time - animationStart;

      if (elapsedTime < 400) {
        window.requestAnimationFrame(handleAnimation);
      } else {
        detailsElement.removeAttribute('open');
        if (detailsElement.closest('details[open]')) {
          trapFocus(detailsElement.closest('details[open]'), detailsElement.querySelector('summary'));
        }
      }
    };

    window.requestAnimationFrame(handleAnimation);
  }
}

customElements.define('wm-menu-drawer', WmMenuDrawer);

/* -------------------------------------
  GLOBAL COPY TO CLIPBOARD
  - Alex: lifted from share.js
  - For use with ConvertFlow/other tools
------------------------------------- */
/* Usage:
<copy-to-clipboard for="#share-url">
  <button type="button" id="share-url">Copy</button>

  <!-- This starts hidden; will be unhidden after copy -->
  <span data-success hidden>Copied!</span>
</copy-to-clipboard>
*/
class CopyToClipboard extends HTMLElement {
  connectedCallback() {
    this.button = this.querySelector('button');
    this.success = this.querySelector('[data-success]');
    if (this.button) {
      this.button.addEventListener('click', () => this._copy());
    }
  }

  async _copy() {
    const text = this.button.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      if (this.success) {
        // Prefer the attribute, else keep whatever is inside already
        const attrText = this.success.getAttribute('text');
        if (attrText) this.success.textContent = attrText;
        if (this.success.hidden) this.success.hidden = false;
      }
    } catch (err) {
      console.error('Copy failed', err);
    }
  }
}
customElements.define('copy-to-clipboard', CopyToClipboard);