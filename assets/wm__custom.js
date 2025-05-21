class EmblaSlider extends HTMLElement {
  constructor() {
    super();
    this.embla = null;
    this.cleanupProgress = null;
  }

  connectedCallback() {
    const emblaNode = this.querySelector('[data-js-embla]');
    const emblaContainer = emblaNode?.querySelector('[data-js-embla-container]');
    const prevBtn = this.querySelector('[data-js-embla-prev]');
    const nextBtn = this.querySelector('[data-js-embla-next]');
    const progressBar = this.querySelector('[data-js-embla-progress]');

    if (!window.EmblaCarousel) {
      console.error("Embla or plugin not loaded");
      return;
    }

    if (!emblaNode || !emblaContainer) {
      console.error("No nodes");
      return;
    }

    const loop = this.getAttribute('data-loop') === 'true';
    const align = this.getAttribute('data-align') || 'start';
    const skipSnaps = this.getAttribute('data-skip-snaps') !== 'false';

    this.embla = EmblaCarousel(emblaNode, {
      loop,
      align,
      skipSnaps,
    });

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
        const raw = this.embla.scrollProgress(); // 0–1
        const clamped = Math.min(1, Math.max(0, raw)); // ensure bounds
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
      updateProgress(); // Initial call

      this.cleanupProgress = () => {
        clearTimeout(this.debounceTimeout);
        this.embla.off('scroll', debouncedUpdate);
        this.embla.off('reInit', updateProgress);
      };
    }
  }

  disconnectedCallback() {
    if (this.embla) this.embla.destroy();
    if (this.cleanupProgress) this.cleanupProgress();
  }
}

customElements.define('embla-slider', EmblaSlider);
