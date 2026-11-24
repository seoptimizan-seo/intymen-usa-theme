/*
 * seopt-marquesina-promocional.js  |  Versión 1.1.0 (2026-11-23)
 * Librería: seoptimizan-shopify-components  |  Autor: Seoptimizan
 *
 * Elemento personalizado <seopt-ribbon>: controla la pausa de la marquesina y
 * repite los textos para que no quede un hueco al final del recorrido.
 * Se carga desde la sección con defer. Sin variables globales ni librerías.
 * Compatible con el editor de temas: connectedCallback se ejecuta cada vez
 * que Shopify vuelve a insertar la sección (shopify:section:load).
 *
 * Accesibilidad (WCAG 2.2.2 Pausar, detener, ocultar):
 *   - botón de pausa/reproducción operable con teclado;
 *   - pausa mientras el puntero o el foco de teclado están dentro;
 *   - con prefers-reduced-motion el CSS detiene la animación.
 */
(function () {
  'use strict';

  if (customElements.get('seopt-ribbon')) return;

  class SeoptRibbon extends HTMLElement {
    connectedCallback() {
      this.inner = this.querySelector('[data-seopt-ribbon-inner]');
      this.toggle = this.querySelector('[data-seopt-ribbon-toggle]');
      if (!this.inner || !this.toggle) return;

      this.iconPause = this.querySelector('[data-seopt-ribbon-icon="pause"]');
      this.iconPlay = this.querySelector('[data-seopt-ribbon-icon="play"]');
      this.pausedByUser = false;

      this.track = this.querySelector('.seopt-ribbon__track');
      this.groups = this.querySelectorAll('[data-seopt-ribbon-group]');
      this.repeats = 1;
      if (this.track && this.groups.length === 2) {
        this.setItems = Array.from(this.groups[0].children);
        this.fill();
        if (window.ResizeObserver) {
          this.observer = new ResizeObserver(() => this.fill());
          this.observer.observe(this.track);
        }
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => this.fill());
        }
      }

      this.toggle.addEventListener('click', () => {
        this.pausedByUser = !this.pausedByUser;
        this.setPaused(this.pausedByUser);
      });

      this.addEventListener('focusin', () => this.setPaused(true));
      this.addEventListener('focusout', () => {
        if (!this.pausedByUser) this.setPaused(false);
      });
      this.addEventListener('mouseenter', () => this.setPaused(true));
      this.addEventListener('mouseleave', () => {
        if (!this.pausedByUser) this.setPaused(false);
      });
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
    }

    /* Calcula cuántas veces hay que repetir el conjunto de textos para que un
       grupo cubra todo el ancho visible. Así, al pasar el último texto vuelve
       a entrar el primero sin hueco, incluso en pantallas anchas. */
    fill() {
      const trackWidth = this.track.clientWidth;
      const setWidth = this.setWidth();
      if (!trackWidth || !setWidth) return;

      const repeats = Math.max(1, Math.ceil(trackWidth / setWidth));
      if (repeats === this.repeats) return;

      this.groups.forEach((group) => {
        group.querySelectorAll('[data-seopt-ribbon-clone]').forEach((node) => node.remove());
        for (let r = 1; r < repeats; r++) {
          this.setItems.forEach((item) => {
            const copy = item.cloneNode(true);
            copy.removeAttribute('data-shopify-editor-block');
            copy.setAttribute('data-seopt-ribbon-clone', '');
            copy.setAttribute('aria-hidden', 'true');
            group.appendChild(copy);
          });
        }
      });
      this.repeats = repeats;
      this.inner.style.setProperty('--seopt-ribbon-repeats', String(repeats));
    }

    /* Ancho de un conjunto de textos, con su separación final. */
    setWidth() {
      const group = this.groups[0];
      const clones = group.querySelectorAll('[data-seopt-ribbon-clone]');
      if (clones.length === 0) return group.getBoundingClientRect().width;
      return group.getBoundingClientRect().width / this.repeats;
    }

    setPaused(paused) {
      this.inner.classList.toggle('seopt-ribbon__inner--paused', paused);
      this.toggle.setAttribute('aria-pressed', String(paused));
      if (this.iconPause) this.iconPause.hidden = paused;
      if (this.iconPlay) this.iconPlay.hidden = !paused;
    }
  }

  customElements.define('seopt-ribbon', SeoptRibbon);
})();
