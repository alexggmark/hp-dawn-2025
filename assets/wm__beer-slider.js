/* 
  Alex - customised component handling before/after sliders
  Currently it's vanilla JS class, had difficulty translating to web component
  Using a 'querySelectorAll' --> 'forEach' --> 'new' to instantiate in reusable way
*/

class BeerSlider {
  constructor (element) {
    this.start = 50;
    if (!element || element.children.length !== 2) {
        return
    }
    this.element = element
    this.revealContainer = this.element.children[1]
    if (this.revealContainer.children.length < 1) {
        return
    }
    this.revealElement = this.revealContainer.children[0]
    this.range = this.addElement('input', {
        type: 'range',
        class: `beer-range`,
        'aria-label': 'Percent of revealed content',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': this.start,
        value: this.start,
        min: '0',
        max: '100'
    })
    this.handle = this.addElement('span', {
        class: `beer-handle`
    })
    this.init()
  }
  init () {
      this.element.classList.add(`beer-ready`)
      this.setImgWidth()
      this.move()
      this.addListeners()
  }
  addElement (tag, attributes) {
      const el = document.createElement(tag)
      Object.keys(attributes).forEach( (key) => {
          el.setAttribute(key, attributes[key])
      })
      this.element.appendChild(el)
      return el
  }
  setImgWidth () {
    //   this.revealElement.style.width = getComputedStyle(this.element)['width']
    this.revealElement.style.width = `${this.element.getBoundingClientRect().width}px`;
  }
  addListeners () {
      const eventTypes = ['input', 'change']
      eventTypes.forEach( (i) => {
          this.range.addEventListener( i, () => {this.move()} )
      })
      window.addEventListener('resize', () => {this.setImgWidth()})
  }
  move () {
      this.revealContainer.style.width = `${this.range.value}%`
      this.handle.style.left = `${this.range.value}%`
      this.range.setAttribute('aria-valuenow', this.range.value)
  }
}

document.querySelectorAll('.beer-slider').forEach((element) => {
  new BeerSlider(element);
})