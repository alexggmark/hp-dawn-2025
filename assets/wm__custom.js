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
