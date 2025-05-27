class ExpertsSliderEmbla extends HTMLElement {
  constructor() {
    super();
    this.embla = null;
    this.debounceTimeout = null;
    this.hasInitialised = false;
  }

  connectedCallback() {
    const isLazy = this.hasAttribute('data-lazy');

    if (isLazy) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.initSlider();
            observer.unobserve(this);
          }
        });
      }, {
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.1,
      });

      observer.observe(this);
    } else {
      this.initSlider();
    }
  }

  disconnectedCallback() {
    if (this.embla) this.embla.destroy();
    clearTimeout(this.debounceTimeout);
  }

  initSlider() {
    if (this.hasInitialised) return;
    this.hasInitialised = true;

    const emblaNode = this.querySelector('[data-js-embla]');
    const emblaContainer = emblaNode?.querySelector('[data-js-embla-container]');
    const prevBtn = this.querySelector('[data-js-embla-prev]');
    const nextBtn = this.querySelector('[data-js-embla-next]');
    const slideNodes = this.querySelectorAll('[data-js-expert-slide]');
    const contentBlocks = this.querySelectorAll('[data-js-expert-content]');

    slideNodes.forEach((slide, index) => {
      slide.addEventListener('click', () => {
        this.embla.scrollTo(index);
      });
    });

    if (!window.EmblaCarousel || !emblaNode || !emblaContainer) {
      console.error("EmblaExperts: EmblaCarousel or DOM nodes missing.");
      return;
    }

    this.embla = EmblaCarousel(emblaNode, {
      loop: true,
      align: 'start',
      containScroll: false,
      skipSnaps: true
    });

    if (prevBtn) prevBtn.addEventListener('click', () => this.embla.scrollPrev());
    if (nextBtn) nextBtn.addEventListener('click', () => this.embla.scrollNext());

    const toggleButtons = () => {
      if (prevBtn) prevBtn.disabled = !this.embla.canScrollPrev();
      if (nextBtn) nextBtn.disabled = !this.embla.canScrollNext();
    };

    const updateActive = () => {
      const index = this.embla.selectedScrollSnap();

      slideNodes.forEach((slide, i) => {
        slide.toggleAttribute('data-active', i === index);
      });

      contentBlocks.forEach((block, i) => {
        block.classList.toggle('expert-content--hidden', i !== index);
      });
    };

    this.embla.on('init', () => {
      toggleButtons();
      updateActive();
    });

    this.embla.on('select', () => {
      toggleButtons();
      updateActive();
    });

    this.embla.on('reInit', () => {
      toggleButtons();
      updateActive();
    });

    toggleButtons();
    updateActive();
  }
}

customElements.define('experts-slider-embla', ExpertsSliderEmbla);
