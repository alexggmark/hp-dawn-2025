class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    this.mainDetailsToggle = this.querySelector('details');
    this.content = this.mainDetailsToggle.querySelector('summary').nextElementSibling;

    this.mainDetailsToggle.addEventListener('focusout', this.onFocusOut.bind(this));
    this.mainDetailsToggle.addEventListener('toggle', this.onToggle.bind(this));
  }

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    });
  }

  onToggle() {
    if (!this.animations) this.animations = this.content.getAnimations();

    if (this.mainDetailsToggle.hasAttribute('open')) {
      this.animations.forEach((animation) => animation.play());
    } else {
      this.animations.forEach((animation) => animation.cancel());
    }
  }

  close() {
    this.mainDetailsToggle.removeAttribute('open');
    this.mainDetailsToggle.querySelector('summary').setAttribute('aria-expanded', false);
  }
}

customElements.define('details-disclosure', DetailsDisclosure);

class HeaderMenu extends DetailsDisclosure {
  constructor() {
    super();
    this.header = document.querySelector('.header-wrapper');
  }

  onToggle() {
    if (!this.header) return;
    this.header.preventHide = this.mainDetailsToggle.open;

    if (document.documentElement.style.getPropertyValue('--header-bottom-position-desktop') !== '') return;
    document.documentElement.style.setProperty(
      '--header-bottom-position-desktop',
      `${Math.floor(this.header.getBoundingClientRect().bottom)}px`
    );
  }
}

customElements.define('header-menu', HeaderMenu);

class DetailsHoverToggle extends HTMLElement {
  constructor() {
    super();
    this.details = this.querySelector('details');
    this.summary = this.querySelector('summary');
    this.headerWrapper = document.querySelector('.header-wrapper');
    this.initialPanel = this.querySelector('[data-js-panel-initial]');
    this.allPanels = this.querySelectorAll('[data-js-panel]');
    this.childTriggers = this.querySelectorAll('[data-js-child]');
    this.nonChildTriggers = this.querySelectorAll('[data-js-child-no-links]');

    this.addEventListeners();
  }

  addEventListeners() {
    if (!this.details || !this.summary) return;

    this.summary.addEventListener('mouseenter', () => {
      this.details.setAttribute('open', true);
      this.headerWrapper?.classList.add('header-wrapper--menu-open');
    });

    this.details.addEventListener('mouseleave', () => {
      this.details.removeAttribute('open');
      this.headerWrapper?.classList.remove('header-wrapper--menu-open');
      this.hideAllPanels();
    });

    this.childTriggers.forEach(trigger => {
      trigger.addEventListener('mouseenter', () => {
        this.showPanel(trigger.dataset.jsChild);
      });
    });

    this.nonChildTriggers.forEach(trigger => {
      trigger.addEventListener('mouseenter', () => {
        if (!this.initialPanel.classList.contains('js-panel--active')) {
          this.hideAllPanels();
        }
      });
    });
  }

  showPanel(key) {
    this.initialPanel.classList.remove('js-panel--active');

    this.allPanels.forEach(panel => {
      panel.classList.toggle('js-panel--active', panel.dataset.jsPanel === key);
    });
  }

  hideAllPanels() {
    this.allPanels.forEach(panel => panel.classList.remove('js-panel--active'));
    this.initialPanel.classList.add('js-panel--active');
  }
}

customElements.define('details-hover-toggle', DetailsHoverToggle);
