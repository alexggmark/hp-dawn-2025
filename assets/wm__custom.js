class EmblaSlider extends HTMLElement {
  constructor() {
    super();
    this.embla = null;
    this.cleanupProgress = null;
    this.debounceTimeout = null;
  }

  connectedCallback() {
    const tabButtons = this.querySelectorAll('[data-js-collection-tab]');
    
    if (tabButtons.length > 0) this.setupTabs(tabButtons);
    this.setupEmbla();
  }

  disconnectedCallback() {
    if (this.embla) this.embla.destroy();
    if (this.cleanupProgress) this.cleanupProgress();
  }

  setupTabs(tabButtons) {
    console.log(`setting up tab buttons`)
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const handle = button.getAttribute('data-js-collection-tab');
        console.log(`CLICKING ${handle}`);
        if (handle) this.loadCollection(handle);
      });
    });

    // Replace this with LIQUID for performance
    // const firstHandle = tabButtons[0].getAttribute('data-js-collection-tab');
    // if (firstHandle) this.loadCollection(firstHandle);
  }

  async loadCollection(handle) {
    console.log(`HANDLE: ${handle}`);
    if (!handle) return;

    const emblaContainer = this.querySelector('[data-js-embla-container]');
    const template = this.querySelector('[data-js-product-card-template]');
    const limitEl = this.querySelector('[data-limit]');

    if (!emblaContainer || !template) return;

    // console.log(`Template + container exist`);

    emblaContainer.innerHTML = `<div class="_p-8">Loading...</div>`;

    try {
      const res = await fetch(`/collections/${handle}/products.json`);
      const data = await res.json();

      
      emblaContainer.innerHTML = '';
      
      const limit = limitEl ? parseInt(limitEl.getAttribute('data-limit')) : Infinity;
      const products = data.products.slice(0, limit);

      console.log(`Limit: ${limit}`)
      console.log(products);

      products.forEach(product => {
        const node = template.content.cloneNode(true);

        const img = node.querySelector('[data-js-tab-template="img"]');
        const img2 = node.querySelector('[data-js-tab-template="img2"]');
        const linkTitle = node.querySelector('[data-js-tab-template="linktitle"]');

        // console.log(`product.title: ${product.title}`)
        // console.log(`product.images[0].src: ${product.images[0].src}`)

        if (img) {
          console.log(img);
          img.removeAttribute('srcset');
          img.removeAttribute('sizes');
          img.src = product.images[0].src;
          img.alt = product.title;
        }
        if (img2) {
          console.log(img2);
          img2.removeAttribute('srcset');
          img2.removeAttribute('sizes');
          img2.src = product.images[1].src;
          img2.alt = product.title;
        }

        if (linkTitle) {
          console.log(linkTitle);
          linkTitle.textContent = product.title;
          linkTitle.href = `/products/${product.handle}`;
        }

        emblaContainer.appendChild(node);
      });

      // Re-initialize Embla
      if (this.embla) this.embla.destroy();
      if (this.cleanupProgress) this.cleanupProgress();
      this.setupEmbla();

    } catch (e) {
      emblaContainer.innerHTML = `<div class="_p-8 _text-red-600">Failed to load collection</div>`;
      console.error('Error loading collection:', e);
    }
  }

  setupEmbla() {
    console.log("SETTING UP EMBLA");
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
