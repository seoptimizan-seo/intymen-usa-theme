/*
 * seopt-hero-simple.js  |  Versión 1.1.0 (2026-11-23)
 * Librería: seoptimizan-shopify-components  |  Autor: Seoptimizan
 *
 * Elemento personalizado <seopt-hero-media>: botón de pausa y control del
 * video de fondo (video subido a Shopify, YouTube o Vimeo). La sección solo
 * carga este archivo (con defer) cuando el fondo es un video.
 *
 * Sin scripts en línea, sin variables globales propias y sin librerías.
 * Excepción documentada: la API oficial de YouTube exige una función global
 * (window.onYouTubeIframeAPIReady); aquí se registra una sola vez por página
 * y se encadena con la que ya existiera.
 * Compatible con el editor de temas: connectedCallback se ejecuta cada vez
 * que Shopify vuelve a insertar la sección (shopify:section:load).
 *
 * Accesibilidad (WCAG 2.2.2 Pausar, detener, ocultar): el botón de pausa
 * siempre es visible y operable con teclado. Con prefers-reduced-motion el
 * video se pausa al cargar y no se reanuda solo.
 */
(function () {
  'use strict';

  if (customElements.get('seopt-hero-media')) return;

  var VIMEO_ORIGIN = 'https://player.vimeo.com';
  var youTubeApi = null;

  function loadYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (youTubeApi) return youTubeApi;

    youTubeApi = new Promise(function (resolve) {
      var previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previous === 'function') previous();
        resolve(window.YT);
      };
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
    return youTubeApi;
  }

  class SeoptHeroMedia extends HTMLElement {
    connectedCallback() {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.pausedByUser = false;
      this.youTubePlayer = null;
      this.vimeoFrame = null;

      this.toggle = this.querySelector('[data-seopt-hero-toggle]');
      this.iconPause = this.querySelector('[data-seopt-hero-icon="pause"]');
      this.iconPlay = this.querySelector('[data-seopt-hero-icon="play"]');
      this.nativeVideo = this.querySelector('.seopt-hero__video--shopify video');

      if (this.toggle) {
        this.toggle.addEventListener('click', () => this.onToggle());
      }

      // El <video> trae autoplay en el HTML (necesario para que arranque solo),
      // así que si el visitante pidió reducir movimiento se pausa al cargar.
      if (this.reducedMotion.matches && this.nativeVideo) this.nativeVideo.pause();
      this.reducedMotion.addEventListener('change', () => {
        if (this.reducedMotion.matches) this.pauseVideo();
      });

      var vimeo = this.querySelector('[data-seopt-hero-vimeo]');
      if (vimeo) this.initVimeo(vimeo);

      var youTube = this.querySelector('[data-seopt-hero-youtube]');
      if (youTube) this.initYouTube(youTube);
    }

    disconnectedCallback() {
      if (this.youTubePlayer && typeof this.youTubePlayer.destroy === 'function') {
        this.youTubePlayer.destroy();
      }
      this.youTubePlayer = null;
    }

    onToggle() {
      this.pausedByUser = !this.pausedByUser;
      this.toggle.setAttribute('aria-pressed', String(this.pausedByUser));
      if (this.iconPause) this.iconPause.hidden = this.pausedByUser;
      if (this.iconPlay) this.iconPlay.hidden = !this.pausedByUser;

      if (this.pausedByUser) {
        this.pauseVideo();
      } else {
        this.playVideo();
      }
    }

    pauseVideo() {
      if (this.nativeVideo) this.nativeVideo.pause();
      if (this.youTubePlayer && typeof this.youTubePlayer.pauseVideo === 'function') {
        this.youTubePlayer.pauseVideo();
      }
      this.sendVimeoCommand('pause');
    }

    playVideo() {
      // Quien pidió reducir movimiento nunca ve el video reanudarse solo.
      if (this.reducedMotion.matches) return;
      if (this.nativeVideo) this.nativeVideo.play().catch(function () {});
      if (this.youTubePlayer && typeof this.youTubePlayer.playVideo === 'function') {
        this.youTubePlayer.playVideo();
      }
      this.sendVimeoCommand('play');
    }

    initVimeo(frame) {
      this.vimeoFrame = frame;
      if (this.reducedMotion.matches) {
        frame.addEventListener('load', () => this.sendVimeoCommand('pause'));
      }
    }

    sendVimeoCommand(method) {
      if (!this.vimeoFrame || !this.vimeoFrame.contentWindow) return;
      try {
        this.vimeoFrame.contentWindow.postMessage(JSON.stringify({ method: method }), VIMEO_ORIGIN);
      } catch (error) {
        /* el iframe aún no está listo: se ignora */
      }
    }

    // YouTube se crea con la API oficial (YT.Player) y no con el truco de URL
    // "?loop=1&playlist=ID": ese truco hace que YouTube trate el embed como
    // una lista y muestre flechas y título al pasar el puntero. Con la API el
    // bucle lo controla este componente (evento onStateChange).
    initYouTube(target) {
      var videoId = target.getAttribute('data-seopt-hero-youtube');
      if (!videoId) return;

      loadYouTubeApi().then((YT) => {
        if (!this.isConnected || !target.isConnected) return;

        var player = new YT.Player(target, {
          videoId: videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3
          },
          events: {
            onReady: (event) => {
              this.youTubePlayer = event.target;
              var iframe = event.target.getIframe();
              iframe.classList.add('seopt-hero__iframe');
              iframe.setAttribute('tabindex', '-1');
              iframe.setAttribute('title', 'Video de fondo');
              event.target.mute();
              if (this.reducedMotion.matches) {
                event.target.pauseVideo();
              } else {
                event.target.playVideo();
              }
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) {
                event.target.seekTo(0);
                event.target.playVideo();
              }
            }
          }
        });

        // El constructor sustituye el marcador por el iframe: se le da la
        // clase enseguida para evitar un parpadeo antes del evento onReady.
        var frame = this.querySelector('.seopt-hero__video--embed iframe');
        if (frame && player) frame.classList.add('seopt-hero__iframe');
      });
    }
  }

  customElements.define('seopt-hero-media', SeoptHeroMedia);
})();
