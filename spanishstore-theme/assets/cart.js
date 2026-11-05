/*
 * Carrito del tema: lógica compartida por la página del carrito (sections/main-cart.liquid)
 * y el carrito lateral (sections/cart-drawer.liquid).
 *
 * - <cart-page>: cada vista del carrito. Cambia cantidades, quita productos, añade/quita el
 *   producto sugerido y aplica cupones con la Cart AJAX API. Pide con el parámetro "sections"
 *   el HTML nuevo de TODAS las vistas del carrito de la página, así siempre están sincronizadas.
 * - <cart-drawer>: el panel lateral (<dialog>). Se abre al añadir un producto y al pulsar el icono
 *   del carrito (salvo en la página del carrito).
 * - window.themeCart.add(items, { discountCode }): añade productos, aplica el código si lo hay,
 *   actualiza las vistas y abre el panel. La usan la ficha de producto y el constructor de packs.
 * - Los formularios de las tarjetas de producto (.product-card__form) se envían por AJAX.
 * Sin JavaScript todo sigue funcionando con los formularios normales de Shopify.
 */
(() => {
  const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  const routes = {
    add: `${root}cart/add.js`,
    change: `${root}cart/change.js`,
    update: `${root}cart/update.js`,
    cart: `${root}cart.js`,
  };

  const cartViews = () => [...document.querySelectorAll('cart-page')];
  const sectionIds = () => [...new Set(cartViews().map((view) => view.dataset.sectionId).filter(Boolean))];
  const hasMainCart = () => cartViews().some((view) => !view.closest('cart-drawer'));

  async function post(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...body, sections: sectionIds(), sections_url: window.location.pathname }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status) throw new Error(data.description || data.message || '');
    return data;
  }

  function updateHeaderCount(count) {
    document.querySelectorAll('.header__cart').forEach((link) => {
      let bubble = link.querySelector('.header__cart-count');
      if (count > 0) {
        if (!bubble) {
          bubble = document.createElement('span');
          bubble.className = 'header__cart-count';
          bubble.setAttribute('aria-hidden', 'true');
          link.append(bubble);
        }
        bubble.textContent = count;
      } else {
        bubble?.remove();
      }
    });
  }

  async function refreshHeaderCount() {
    try {
      const cart = await (await fetch(routes.cart)).json();
      updateHeaderCount(cart.item_count);
      return cart;
    } catch (error) {
      return null;
    }
  }

  // Pinta en cada vista del carrito el HTML que ha devuelto Shopify
  function renderAll(data) {
    cartViews().forEach((view) => view.render(data));
    if (typeof data.item_count === 'number') updateHeaderCount(data.item_count);
    else refreshHeaderCount();
  }

  class CartPage extends HTMLElement {
    connectedCallback() {
      if (this.bound) return;
      this.bound = true;
      this.addEventListener('click', this.onClick.bind(this));
      this.addEventListener('change', this.onChange.bind(this));
      this.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.matches('[data-discount-input]')) {
          event.preventDefault();
          this.applyDiscount();
        }
      });
    }

    onClick(event) {
      const step = event.target.closest('[data-quantity-step]');
      if (step) {
        const input = step.parentElement.querySelector('[data-quantity-input]');
        const max = input.max ? Number(input.max) : Infinity;
        const quantity = Math.min(max, Math.max(0, Number(input.value) + Number(step.dataset.quantityStep)));
        this.changeLine(this.lineOf(step), quantity);
        return;
      }

      const remove = event.target.closest('[data-remove]');
      if (remove) {
        event.preventDefault();
        this.changeLine(this.lineOf(remove), 0);
        return;
      }

      if (event.target.closest('[data-discount-apply]')) {
        this.applyDiscount();
        return;
      }

      const removeCode = event.target.closest('[data-discount-remove]');
      if (removeCode) {
        this.updateDiscounts(this.currentCodes().filter((code) => code !== removeCode.dataset.discountRemove));
        return;
      }

      // Flechas de un carrusel horizontal (p. ej. "You might be interested in")
      const scroll = event.target.closest('[data-scroll]');
      if (scroll) {
        const track = this.querySelector('[data-scroll-track]');
        track?.scrollBy({ left: Number(scroll.dataset.scroll) * track.clientWidth, behavior: 'smooth' });
      }
    }

    onChange(event) {
      if (event.target.matches('[data-quantity-input]')) {
        this.changeLine(this.lineOf(event.target), Math.max(0, Number(event.target.value) || 0));
      } else if (event.target.matches('[data-upsell]')) {
        this.toggleUpsell(event.target);
      }
    }

    lineOf(element) {
      return Number(element.closest('[data-line]').dataset.line);
    }

    currentCodes() {
      return [...this.querySelectorAll('[data-discount-remove]')].map((button) => button.dataset.discountRemove);
    }

    async request(url, body) {
      this.classList.add('is-loading');
      this.showError('');
      try {
        const data = await post(url, body);
        renderAll(data);
        return data;
      } catch (error) {
        this.showError(error.message || this.dataset.error);
        return null;
      } finally {
        this.classList.remove('is-loading');
      }
    }

    changeLine(line, quantity) {
      return this.request(routes.change, { line, quantity });
    }

    async toggleUpsell(input) {
      if (input.checked) {
        await this.request(routes.add, { items: [{ id: Number(input.dataset.variantId), quantity: 1 }] });
      } else if (input.dataset.lineKey) {
        await this.request(routes.change, { id: input.dataset.lineKey, quantity: 0 });
      }
    }

    async applyDiscount() {
      const input = this.querySelector('[data-discount-input]');
      const code = input?.value.trim();
      if (!code) return;
      const data = await this.updateDiscounts([...new Set([...this.currentCodes(), code])]);
      if (!data) {
        // Si la API no admite códigos en el carrito, se aplica con el enlace de descuento de Shopify
        window.location.href = `${root}discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const applied = (data.discount_codes || []).find((item) => item.code.toUpperCase() === code.toUpperCase());
      if (!applied || !applied.applicable) {
        const message = this.querySelector('[data-discount-message]');
        if (message) {
          message.textContent = this.dataset.discountInvalid || '';
          message.hidden = false;
        }
      }
    }

    updateDiscounts(codes) {
      return this.request(routes.update, { discount: codes.join(',') });
    }

    render(data) {
      const html = data.sections && data.sections[this.dataset.sectionId];
      if (!html) return;
      const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('cart-page');
      if (!fresh) return;
      const focusedLine = this.contains(document.activeElement) ? document.activeElement.closest('[data-line]')?.dataset.line : null;
      const scrolls = [...this.querySelectorAll('[data-scroll-area]')].map((area) => area.scrollTop);
      this.innerHTML = fresh.innerHTML;
      this.querySelectorAll('[data-scroll-area]').forEach((area, index) => {
        area.scrollTop = scrolls[index] || 0;
      });
      if (focusedLine) this.querySelector(`[data-line="${focusedLine}"] [data-quantity-input]`)?.focus();
    }

    showError(message) {
      const error = this.querySelector('[data-cart-error]');
      if (!error) return;
      error.textContent = message;
      error.hidden = !message;
    }
  }

  class CartDrawer extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector('dialog');
      if (!this.dialog) return;
      // Clic fuera del panel (en el fondo) o en un botón de cerrar
      this.dialog.addEventListener('click', (event) => {
        if (event.target === this.dialog || event.target.closest('[data-drawer-close]')) this.close();
      });
      this.dialog.addEventListener('close', () => this.classList.remove('is-open'));
      // Escape: cierra con la misma animación que el botón
      this.dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        this.close();
      });
    }

    open() {
      if (!this.dialog || this.dialog.open) return;
      this.dialog.showModal();
      // Se fuerza el cálculo del estilo cerrado para que la transición se vea al abrir
      void this.dialog.offsetWidth;
      this.classList.add('is-open');
      this.dialog.querySelector('[data-drawer-close]')?.focus();
    }

    close() {
      if (!this.dialog?.open) return;
      this.classList.remove('is-open');
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => this.dialog.close(), reduce ? 0 : 250);
    }
  }

  if (!customElements.get('cart-page')) customElements.define('cart-page', CartPage);
  if (!customElements.get('cart-drawer')) customElements.define('cart-drawer', CartDrawer);

  function openDrawer() {
    if (hasMainCart()) return false;
    const drawer = document.querySelector('cart-drawer');
    if (!drawer) return false;
    drawer.open();
    return true;
  }

  async function add(items, options = {}) {
    const data = await post(routes.add, { items });
    renderAll(data);

    if (options.discountCode) {
      const cart = await refreshHeaderCount();
      const codes = new Set(((cart && cart.discount_codes) || []).map((item) => item.code));
      codes.add(options.discountCode);
      try {
        renderAll(await post(routes.update, { discount: [...codes].join(',') }));
      } catch (error) {
        // Si no se puede aplicar aquí, Shopify lo aplica con el enlace de descuento
        window.location.href = `${root}discount/${encodeURIComponent(options.discountCode)}?redirect=${encodeURIComponent(`${root}cart`)}`;
        return data;
      }
    }

    if (!openDrawer() && !hasMainCart()) window.location.href = `${root}cart`;
    return data;
  }

  window.themeCart = { add, open: openDrawer, refresh: refreshHeaderCount };

  // Editor de temas: el panel se abre al seleccionar su sección y se cierra al salir
  document.addEventListener('shopify:section:select', (event) => {
    if (event.target.querySelector('cart-drawer')) event.target.querySelector('cart-drawer').open();
  });
  document.addEventListener('shopify:section:deselect', (event) => {
    if (event.target.querySelector('cart-drawer')) event.target.querySelector('cart-drawer').close();
  });

  // Tarjetas de producto: "Add to cart" sin salir de la página
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('form.product-card__form');
    if (!form || !window.fetch) return;
    event.preventDefault();
    const buttons = form.querySelectorAll('button');
    buttons.forEach((button) => (button.disabled = true));
    form.classList.add('is-loading');
    try {
      await add([{ id: Number(form.querySelector('[name="id"]').value), quantity: 1 }]);
    } catch (error) {
      form.submit();
    } finally {
      buttons.forEach((button) => (button.disabled = false));
      form.classList.remove('is-loading');
    }
  });

  // Icono del carrito de la cabecera: abre el panel (en la página del carrito, navega normal)
  document.addEventListener('click', (event) => {
    const link = event.target.closest('.header__cart');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (openDrawer()) event.preventDefault();
  });
})();
