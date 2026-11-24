/*
 * seopt-cuadricula-blogs.js  |  Versión 1.1.0 (2026-11-23)
 * Librería: seoptimizan-shopify-components  |  Autor: Seoptimizan
 *
 * Elemento personalizado <seopt-blog-grid>: barra de progreso del carrusel
 * móvil (menos de 750px). Se carga desde la sección con defer. Sin variables
 * globales ni librerías. Compatible con el editor de temas: connectedCallback
 * se ejecuta cada vez que Shopify vuelve a insertar la sección.
 */
(function () {
  'use strict';

  if (customElements.get('seopt-blog-grid')) return;

  var MIN_BAR = 20;

  class SeoptBlogGrid extends HTMLElement {
    connectedCallback() {
      this.list = this.querySelector('.seopt-blog-grid__list');
      this.bar = this.querySelector('[data-seopt-blog-progress]');
      if (!this.list || !this.bar) return;

      this.desktop = window.matchMedia('(min-width: 750px)');
      this.onUpdate = () => this.update();

      this.list.addEventListener('scroll', this.onUpdate, { passive: true });
      this.desktop.addEventListener('change', this.onUpdate);
      if (typeof ResizeObserver === 'function') {
        this.observer = new ResizeObserver(this.onUpdate);
        this.observer.observe(this.list);
      }

      this.update();
    }

    disconnectedCallback() {
      if (this.list && this.onUpdate) this.list.removeEventListener('scroll', this.onUpdate);
      if (this.desktop && this.onUpdate) this.desktop.removeEventListener('change', this.onUpdate);
      if (this.observer) this.observer.disconnect();
    }

    update() {
      if (this.desktop.matches) {
        this.bar.style.width = '0%';
        return;
      }

      var scrollLeft = this.list.scrollLeft;
      var scrollWidth = this.list.scrollWidth;
      var clientWidth = this.list.clientWidth;
      var maxScroll = scrollWidth - clientWidth;

      if (maxScroll <= 0) {
        this.bar.style.width = '100%';
        return;
      }

      var visibleRatio = clientWidth / scrollWidth;
      var scrollProgress = scrollLeft / maxScroll;
      var barWidth = scrollLeft === 0 ? MIN_BAR : Math.max(MIN_BAR, visibleRatio * 100);
      var finalWidth = barWidth + scrollProgress * (100 - barWidth);
      this.bar.style.width = Math.min(100, Math.max(MIN_BAR, finalWidth)) + '%';
    }
  }

  customElements.define('seopt-blog-grid', SeoptBlogGrid);
})();
