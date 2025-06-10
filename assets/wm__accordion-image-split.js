class AccordionImageSplit extends HTMLElement {
  constructor() {
    super();
    this.triggers = this.querySelectorAll('[data-js-trigger]');
    this.panels = this.querySelectorAll('[data-js-accordion-panel]');
    this.details = this.querySelectorAll('details');
    this.hasMotion = (typeof window.Motion === 'object' && typeof window.Motion.animate === 'function');

    this.addEventListeners();
  }

  addEventListeners() {
    this.triggers.forEach(trigger => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        const key = trigger.dataset.jsTrigger;

        this.closeDetails();

        const parentDetails = trigger.closest('details');
        if (parentDetails) {
          this.openDetail(parentDetails);
        }

        this.showPanel(key);
      });
    });
  }

  openDetail(detail) {
    if (detail.open == true) return;

    const content = detail.querySelector('div');
    if (!content) {
      detail.open = true;
      return;
    }

    if (this.hasMotion) {
      detail.open = true;
      content.style.overflow = 'hidden';
      content.style.display = 'block';
      Motion.animate(content, {
        opacity: [0, 1],
        height: ['0px', `${content.scrollHeight}px`]
      }, {
        duration: 0.4,
        easing: 'ease-out'
      });
    } else {
      detail.open = true;
    }
  }

  closeDetails() {
    this.details.forEach(detail => {
      const content = detail.querySelector('div');
      if (!content) {
        detail.open = false;
        return;
      }

      if (this.hasMotion && detail.hasAttribute('open')) {
        Motion.animate(content, {
          opacity: [1, 0],
          height: [`${content.scrollHeight}px`, '0px']
        }, {
          duration: 0.2,
          easing: 'ease-in'
        }).finished.then(() => {
          content.style.display = 'none';
          detail.removeAttribute('open');
        });
      } else {
        detail.open = false;
      }
    });
  }

  showPanel(key) {
    this.panels.forEach(panel => {
      panel.classList.toggle('js-panel--active', panel.dataset.jsAccordionPanel === key);
    });
  }
}

customElements.define('accordion-image-split', AccordionImageSplit);
