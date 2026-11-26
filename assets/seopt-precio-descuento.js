/*
 * seopt-precio-descuento.js  |  Versión 1.3.0 (2026-11-26)
 * Librería: seoptimizan-shopify-components  |  Autor: Seoptimizan
 *
 * Elemento personalizado <seopt-price-discount>: para los productos de una
 * colección con descuento automático por porcentaje, muestra el precio final con
 * el precio original tachado, en las tarjetas de producto y en la ficha. No toca
 * ningún archivo de Dawn: lee el precio que Dawn ya pintó, lo oculta con
 * style.display y agrega su propio bloque.
 *
 * Configuración (atributos que entrega la sección):
 *   data-rules          lista de reglas {coleccion, porcentaje, inicio, fin, etiqueta,
 *                       etiqueta_oferta}
 *   data-probe          el número 1234567,89 con el formato de dinero de la tienda
 *   data-original-label, data-final-label   textos accesibles
 *   data-show-badge, data-skip-on-sale      "true" o "false"
 *
 * Productos que ya tienen precio comparativo (Dawn los marca con price--on-sale):
 * con data-skip-on-sale="true" no se tocan; con "false" se muestra el precio de
 * lista tachado (el comparativo) y el precio final con el descuento aplicado
 * sobre el precio de oferta, que es lo que cobra Shopify. Nunca se muestran tres
 * precios. La etiqueta Oferta nativa de Dawn se oculta mientras el descuento está
 * a la vista: la de la ficha (.price__badge-sale) y la de la tarjeta, que va sobre
 * la imagen (.card__badge .badge).
 *
 * Cómo funciona:
 *   1. Los productos de cada colección con regla vigente se piden a
 *      /collections/<handle>/products.json y se guardan 10 minutos en
 *      sessionStorage.
 *   2. El precio se lee del texto que Dawn pintó, con los separadores del
 *      formato de la tienda (sale de data-probe), y se formatea igual.
 *   3. Un MutationObserver vuelve a decorar cuando Dawn reemplaza el precio (al
 *      cambiar de variante, al cargar más productos o al filtrar).
 *
 * El descuento es solo visual: lo que se cobra lo calcula Shopify en el carrito.
 * Sin variables globales ni librerías. Respeta el editor de temas porque
 * connectedCallback corre cada vez que Shopify vuelve a insertar la sección.
 */
(function () {
  'use strict';

  if (customElements.get('seopt-price-discount')) return;

  var CACHE_MS = 10 * 60 * 1000;
  var MAX_PAGES = 20;
  var NUM = /\d[\d.,'   ]*/;

  function parseJson(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  /* Dinero: formato de la tienda a partir de un ejemplo ya formateado. */
  function readFormat(probe) {
    var m = /^(\D*?)(\d[\d.,'   ]*\d)(\D*)$/.exec(String(probe || '').trim());
    if (!m) return null;
    var body = m[2];
    var dm = /([.,])(\d{2})$/.exec(body);
    var decimals = dm ? 2 : 0;
    var decSep = dm ? dm[1] : '';
    var intPart = dm ? body.slice(0, body.length - 3) : body;
    var tm = /[^\d]/.exec(intPart);
    return { prefix: m[1], suffix: m[3], decimals: decimals, decSep: decSep, thousands: tm ? tm[0] : ',' };
  }

  function formatMoney(fmt, minor) {
    var value = minor / Math.pow(10, fmt.decimals);
    var parts = Math.abs(value).toFixed(fmt.decimals).split('.');
    var integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, fmt.thousands);
    return fmt.prefix + integer + (parts[1] ? fmt.decSep + parts[1] : '') + fmt.suffix;
  }

  /* Texto de Dawn -> { minor: unidades menores, label: texto previo (Desde...) }. */
  function readPrice(fmt, text) {
    var m = NUM.exec(text || '');
    if (!m) return null;
    var body = m[0].replace(/[\s.,']+$/, '');
    var integer = body;
    var decimal = '';
    if (fmt.decimals) {
      var i = body.lastIndexOf(fmt.decSep);
      if (i >= 0 && body.length - i - 1 === fmt.decimals) {
        integer = body.slice(0, i);
        decimal = body.slice(i + 1);
      }
    }
    integer = integer.replace(/\D/g, '');
    if (!integer) return null;
    var minor = parseInt(integer + (decimal || new Array(fmt.decimals + 1).join('0')), 10);
    if (isNaN(minor)) return null;

    var lead = text.slice(0, m.index).replace(/\s+$/, '');
    var prefix = fmt.prefix.replace(/\s+$/, '');
    if (prefix && lead.slice(-prefix.length) === prefix) lead = lead.slice(0, -prefix.length);
    return { minor: minor, label: lead.replace(/\s+$/, '') };
  }

  function discounted(minor, percent) {
    return minor - Math.round((minor * percent) / 100);
  }

  /* Reglas vigentes (la fecha vacía significa sin límite). */
  function activeRules(rules, now) {
    var out = [];
    (Array.isArray(rules) ? rules : []).forEach(function (r) {
      var percent = Number(r && r.porcentaje);
      var handle = r && typeof r.coleccion === 'string' ? r.coleccion.trim() : '';
      if (!handle || !(percent > 0 && percent < 100)) return;
      var start = r.inicio ? Date.parse(r.inicio) : -Infinity;
      var end = r.fin ? Date.parse(r.fin) : Infinity;
      if (isNaN(start) || isNaN(end)) return;
      if (now < start || now > end) return;
      out.push({
        coleccion: handle,
        porcentaje: percent,
        etiqueta: r.etiqueta ? String(r.etiqueta) : '',
        etiquetaOferta: r.etiqueta_oferta ? String(r.etiqueta_oferta) : ''
      });
    });
    return out;
  }

  function loadHandles(collection) {
    var key = 'seopt-pd:' + collection;
    try {
      var cached = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (cached && Date.now() - cached.t < CACHE_MS) return Promise.resolve(cached.h);
    } catch (e) {
      /* sin sessionStorage: se pide cada vez */
    }

    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    var handles = [];

    function page(n) {
      return fetch(root + 'collections/' + encodeURIComponent(collection) + '/products.json?limit=250&page=' + n)
        .then(function (res) {
          return res.ok ? res.json() : { products: [] };
        })
        .then(function (data) {
          var list = (data && data.products) || [];
          list.forEach(function (p) {
            if (p && p.handle) handles.push(p.handle);
          });
          if (list.length === 250 && n < MAX_PAGES) return page(n + 1);
        });
    }

    return page(1)
      .catch(function () {
        /* sin red: queda lo que se alcanzó a leer */
      })
      .then(function () {
        try {
          sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), h: handles }));
        } catch (e) {
          /* sin sessionStorage */
        }
        return handles;
      });
  }

  function productHandle(price) {
    var url = '';
    var card = price.closest('.card-wrapper');
    if (card) {
      var link = card.querySelector('a[href*="/products/"]');
      url = link ? link.getAttribute('href') : '';
    } else {
      var info = price.closest('product-info');
      url = (info && info.getAttribute('data-url')) || window.location.pathname;
    }
    var m = /\/products\/([^/?#]+)/.exec(url || '');
    return m ? decodeURIComponent(m[1]) : '';
  }

  class SeoptPriceDiscount extends HTMLElement {
    connectedCallback() {
      this.rules = parseJson(this.getAttribute('data-rules'), []);
      this.fmt = readFormat(this.getAttribute('data-probe'));
      this.showBadge = this.getAttribute('data-show-badge') !== 'false';
      this.skipOnSale = this.getAttribute('data-skip-on-sale') !== 'false';
      this.originalLabel = this.getAttribute('data-original-label') || '';
      this.finalLabel = this.getAttribute('data-final-label') || '';
      this.members = {};
      this.scheduled = false;

      this.active = activeRules(this.rules, Date.now());
      if (!this.fmt || this.active.length === 0) return;

      var collections = [];
      this.active.forEach(function (r) {
        if (collections.indexOf(r.coleccion) < 0) collections.push(r.coleccion);
      });

      Promise.all(
        collections.map(
          function (c) {
            return loadHandles(c).then(
              function (handles) {
                this.members[c] = new Set(handles);
              }.bind(this)
            );
          }.bind(this)
        )
      ).then(
        function () {
          if (!this.isConnected) return;
          this.scan();
          this.observer = new MutationObserver(this.schedule.bind(this));
          this.observer.observe(document.body, { childList: true, subtree: true });
        }.bind(this)
      );
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
    }

    schedule() {
      if (this.scheduled) return;
      this.scheduled = true;
      window.requestAnimationFrame(
        function () {
          this.scheduled = false;
          this.scan();
        }.bind(this)
      );
    }

    scan() {
      var prices = document.querySelectorAll('.price');
      for (var i = 0; i < prices.length; i++) this.decorate(prices[i]);
    }

    bestRule(handle) {
      var best = null;
      this.active.forEach(
        function (r) {
          var set = this.members[r.coleccion];
          if (set && set.has(handle) && (!best || r.porcentaje > best.porcentaje)) best = r;
        }.bind(this)
      );
      return best;
    }

    restore(price) {
      var block = price.querySelector(':scope > .seopt-pd');
      if (block) block.remove();
      var container = price.querySelector(':scope > .price__container');
      if (container) container.style.display = '';
      var saleBadge = price.querySelector(':scope > .price__badge-sale');
      if (saleBadge) saleBadge.style.display = '';
      price.removeAttribute('data-seopt-pd');
      var card = price.closest('.card-wrapper');
      if (card && !card.querySelector('[data-seopt-pd]')) {
        card.querySelectorAll('[data-seopt-pd-hidden]').forEach(function (badge) {
          badge.style.display = '';
          badge.removeAttribute('data-seopt-pd-hidden');
        });
      }
    }

    decorate(price) {
      var container = price.querySelector(':scope > .price__container');
      if (!container) return;

      var skip = price.classList.contains('price--sold-out') || (this.skipOnSale && price.classList.contains('price--on-sale'));
      var regular = container.querySelector('.price__regular .price-item--regular');
      var read = !skip && regular ? readPrice(this.fmt, regular.textContent) : null;
      var handle = read ? productHandle(price) : '';
      var rule = handle ? this.bestRule(handle) : null;

      if (!rule) {
        if (price.hasAttribute('data-seopt-pd')) this.restore(price);
        return;
      }

      var finalMinor = discounted(read.minor, rule.porcentaje);
      var listMinor = read.minor;
      if (price.classList.contains('price--on-sale')) {
        var compare = container.querySelector('.price__sale s.price-item--regular');
        var compareRead = compare ? readPrice(this.fmt, compare.textContent) : null;
        if (compareRead && compareRead.minor > read.minor) listMinor = compareRead.minor;
      }
      var key = rule.coleccion + ':' + rule.porcentaje + ':' + read.minor + ':' + listMinor + ':' + read.label + ':' + rule.etiqueta + ':' + rule.etiquetaOferta;
      if (price.getAttribute('data-seopt-pd') === key && price.querySelector(':scope > .seopt-pd')) return;

      var block = price.querySelector(':scope > .seopt-pd');
      if (block) block.remove();
      block = this.build(rule, read, finalMinor, listMinor, listMinor > read.minor);
      container.style.display = 'none';
      /* La etiqueta Oferta de Dawn (en la ficha) sobra: ya va la del porcentaje. */
      var nativeBadge = price.querySelector(':scope > .price__badge-sale');
      if (nativeBadge) nativeBadge.style.display = 'none';
      /* En las tarjetas, la etiqueta Oferta de Dawn va sobre la imagen. Un
         producto agotado nunca llega aquí (se salta arriba), así que no se oculta
         la etiqueta Agotado. */
      var card = price.closest('.card-wrapper');
      if (card) {
        card.querySelectorAll('.card__badge .badge').forEach(function (badge) {
          badge.style.display = 'none';
          badge.setAttribute('data-seopt-pd-hidden', '');
        });
      }
      price.insertBefore(block, container.nextSibling);
      price.setAttribute('data-seopt-pd', key);
    }

    build(rule, read, finalMinor, listMinor, wasOnSale) {
      var block = document.createElement('div');
      block.className = 'seopt-pd';

      function sr(text) {
        var s = document.createElement('span');
        s.className = 'seopt-pd__sr';
        s.textContent = text;
        return s;
      }

      var final = document.createElement('span');
      final.className = 'seopt-pd__final';
      final.textContent = (read.label ? read.label + ' ' : '') + formatMoney(this.fmt, finalMinor);

      var old = document.createElement('s');
      old.className = 'seopt-pd__old';
      old.textContent = formatMoney(this.fmt, listMinor);

      block.appendChild(sr(this.finalLabel));
      block.appendChild(final);
      block.appendChild(sr(this.originalLabel));
      block.appendChild(old);

      if (this.showBadge) {
        var badge = document.createElement('span');
        badge.className = 'seopt-pd__badge';
        var text = (wasOnSale && rule.etiquetaOferta) || rule.etiqueta || '-' + rule.porcentaje + '%';
        /* [total]: descuento real desde el precio original hasta el final.
           [porcentaje]: el de la regla. */
        var total = listMinor > 0 ? Math.round((1 - finalMinor / listMinor) * 100) : rule.porcentaje;
        badge.textContent = text.split('[total]').join(String(total)).split('[porcentaje]').join(String(rule.porcentaje));
        block.appendChild(badge);
      }
      return block;
    }
  }

  customElements.define('seopt-price-discount', SeoptPriceDiscount);
})();
