class ExpertsCarousel extends HTMLElement {
  connectedCallback() {
    this.expertCards = [...this.querySelectorAll('[data-js-expert-slide]')];
    this.expertContents = [...this.querySelectorAll('[data-js-expert-content]')];

    this.expertCards.forEach((card, index) => {
      card.addEventListener('click', () => this.showExpert(index));
    });

    this.showExpert(0); // Show the first expert by default
  }

  showExpert(index) {
    this.expertCards.forEach((card, i) => {
      card.toggleAttribute('data-active', i === index);
    });

    this.expertContents.forEach((content, i) => {
      if (i === index) {
        content.classList.remove('expert-content--hidden');
      } else {
        content.classList.add('expert-content--hidden');
      }
    });
  }
}

customElements.define('experts-carousel', ExpertsCarousel);
