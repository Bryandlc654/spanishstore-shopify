/*
 * Motor de animación del tema (ajuste "Animations → Reveal sections on scroll").
 * Solo anima transform/translate/scale, opacity y clip-path; un único IntersectionObserver para las entradas
 * y un único bucle requestAnimationFrame (solo cuando hay algo visible que mover) para el parallax.
 *
 * 1. Entradas al hacer scroll, con una coreografía distinta según el tipo de sección:
 *    títulos palabra a palabra → textos y botones → tarjetas escalonadas (desde abajo, desde un lado o con
 *    zoom y desenfoque) e imágenes grandes reveladas con máscara.
 * 2. Hero (primera sección): entrada en CSS al cargar (critical.css) + parallax de la foto y salida suave del
 *    texto al bajar.
 * 3. Parallax sutil en fotos grandes (solo escritorio con ratón).
 * 4. Contadores (cifras y nota media de las reseñas) que suben desde 0 al aparecer.
 * 5. Barra de progreso de lectura en los artículos.
 *
 * Sin JavaScript, con "reducir movimiento" o en el editor de temas todo se ve en su estado final:
 * los estados ocultos solo existen bajo la clase "js-reveal" de <html> y el layout la quita si este
 * archivo no llega a cargar.
 */
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('js-reveal')) return;
  window.themeReveal = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const designMode = window.Shopify && window.Shopify.designMode;
  if (reduceMotion || !('IntersectionObserver' in window) || designMode) {
    root.classList.remove('js-reveal');
    return;
  }

  const MAX_STAGGER = 7;
  const sections = [...document.querySelectorAll('.main-content > .shopify-section')];
  const firstSection = sections[0];
  const revealSections = sections.slice(1);

  /* ---------- 1. Coreografía por tipo de sección ---------- */

  // Tarjetas y elementos repetidos: variante por sección (por defecto "up")
  const ITEMS = [
    '.carousel__slide',
    '.category-cards__item',
    '.features__item',
    '.collage__item',
    '.product-grid__list > li',
    '.main-collection__grid > li',
    '.main-blog__grid > li',
    '.main-article__more-grid > li',
    '.content-image__stat',
    '.contact-card',
    '.pack-tier',
    '.pack-builder__grid > li',
    '.faq__item',
    '.image-with-list__item',
    '.review-card',
  ].join(',');

  const ITEM_VARIANT = [
    ['.category-cards-section', 'zoom'],
    ['.video-gallery-section', 'left'],
    ['.testimonials-section', 'left'],
    ['.collage-section', 'mask'],
    ['.image-with-list-section', 'right'],
    ['.product-reviews-section', 'left'],
  ];

  // Títulos que se revelan palabra a palabra
  const HEADINGS = [
    '.section-header__heading',
    '.features__heading',
    '.image-with-text__heading',
    '.image-with-list__heading',
    '.promo-banner__heading',
    '.promo-tile__heading',
    '.faq__heading',
    '.countdown-bar__heading',
    '.collage__heading',
    '.hero__heading',
    '.product-information__heading',
    '.product-reviews__heading',
    '.content-image__heading',
    '.text-banner__heading',
  ].join(',');

  // Textos y botones que entran después del título
  const TEXTS = [
    '.section-header__subheading',
    '.section-header__link',
    '.image-with-text__text',
    '.image-with-text .button',
    '.image-with-list__button',
    '.promo-banner__text',
    '.promo-banner__button',
    '.hero__rating',
    '.hero__text',
    '.hero__buttons',
    '.promo-tile__text',
    '.promo-tile__button',
    '.countdown-bar__subheading',
    '.countdown-bar__timer',
    '.countdown-bar__badge',
    '.blog-posts__footer',
    '.product-grid__footer',
    '.faq__footer',
    '.features__subheading',
    '.text-banner__text',
    '.text-banner__button',
    '.product-reviews__overview',
    '.product-reviews__actions',
    '.testimonial:not([hidden]) .testimonial__name',
    '.testimonial:not([hidden]) .testimonial__date',
    '.testimonial:not([hidden]) .testimonial__text',
    '.testimonial:not([hidden]) .testimonial__nav',
  ].join(',');

  // Imágenes grandes: revelado con máscara (dirección según la sección)
  const MEDIA = [
    ['.image-with-text__media', (el) => (el.closest('.image-with-text--reverse') ? 'right' : 'left')],
    ['.image-with-list__media', () => 'up'],
    ['.promo-banner__media', () => 'left'],
    ['.hero--contained', () => 'up'],
    ['.product-information__media', () => 'right'],
    ['.content-image__media', () => 'left'],
    ['.testimonial:not([hidden]) .testimonial__media', () => 'up'],
  ];

  const splitWords = (element) => {
    if (element.dataset.split) return 0;
    element.dataset.split = 'true';
    let index = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/(\s+)/);
          if (parts.every((part) => !part.trim())) return;
          const fragment = document.createDocumentFragment();
          parts.forEach((part) => {
            if (!part) return;
            if (!part.trim()) {
              fragment.append(document.createTextNode(part));
              return;
            }
            const word = document.createElement('span');
            word.className = 'word';
            const inner = document.createElement('span');
            inner.className = 'word__inner';
            inner.style.setProperty('--w', Math.min(index, 14));
            inner.textContent = part;
            word.append(inner);
            fragment.append(word);
            index += 1;
          });
          child.replaceWith(fragment);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(element);
    element.classList.add('reveal-words');
    return index;
  };

  revealSections.forEach((section) => {
    section.setAttribute('data-reveal', '');
    let variant = 'up';
    ITEM_VARIANT.forEach(([selector, name]) => {
      if (section.matches(selector)) variant = name;
    });

    // Títulos
    let words = 0;
    section.querySelectorAll(HEADINGS).forEach((heading) => {
      words = Math.max(words, splitWords(heading));
    });

    // Textos y botones: después del título
    const textDelay = Math.min(words, 8) * 0.04 + 0.15;
    section.querySelectorAll(TEXTS).forEach((text, i) => {
      text.setAttribute('data-reveal-item', 'fade');
      text.style.setProperty('--reveal-delay', `${(textDelay + i * 0.08).toFixed(2)}s`);
    });

    // Tarjetas: índice por lista (cada rejilla o carrusel empieza su propio escalonado)
    const counters = new Map();
    section.querySelectorAll(ITEMS).forEach((item) => {
      const index = counters.get(item.parentElement) || 0;
      counters.set(item.parentElement, index + 1);
      item.setAttribute('data-reveal-item', variant);
      item.style.setProperty('--reveal-index', Math.min(index, MAX_STAGGER));
    });

    // Imágenes grandes
    MEDIA.forEach(([selector, direction]) => {
      section.querySelectorAll(selector).forEach((media) => {
        media.setAttribute('data-reveal-mask', direction(media));
      });
    });
  });

  /* ---------- 4. Contadores ---------- */
  const COUNTERS = '.content-image__stat dd, .product-reviews__average';

  const runCounter = (element) => {
    const original = element.textContent.trim();
    const match = original.match(/^(\D*)([\d.,]+)(.*)$/);
    if (!match) return;
    const [, prefix, numberText, suffix] = match;
    const decimals = (numberText.split('.')[1] || '').length;
    const target = parseFloat(numberText.replace(/,/g, ''));
    if (!Number.isFinite(target)) return;
    const useGrouping = numberText.includes(',');
    const format = (value) =>
      value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping,
      });
    const duration = 1400;
    const start = performance.now();
    element.setAttribute('aria-label', original);
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = `${prefix}${format(target * eased)}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
      else {
        element.textContent = original;
        element.removeAttribute('aria-label');
      }
    };
    requestAnimationFrame(tick);
  };

  /* ---------- Observador de entradas ---------- */
  const reveal = (section) => {
    section.classList.add('is-revealed');
    section.querySelectorAll(COUNTERS).forEach(runCounter);
    // Al terminar, se quitan las marcas de animación: los elementos quedan en su estado normal y sus
    // transiciones propias (p. ej. el hover de los botones) vuelven a responder sin retardo
    setTimeout(() => {
      section.querySelectorAll('[data-reveal-item]').forEach((item) => {
        item.removeAttribute('data-reveal-item');
        item.style.removeProperty('--reveal-delay');
        item.style.removeProperty('--reveal-index');
      });
      section.querySelectorAll('[data-reveal-mask]').forEach((media) => media.removeAttribute('data-reveal-mask'));
    }, 2800);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
  );

  const pending = new Set();
  revealSections.forEach((section) => {
    // Las que ya se ven al cargar aparecen enseguida
    if (section.getBoundingClientRect().top < window.innerHeight * 0.92) {
      requestAnimationFrame(() => reveal(section));
    } else {
      pending.add(section);
      observer.observe(section);
    }
  });

  // Scroll rápido (tecla Fin, saltos con anclas…): una sección puede pasar sin llegar a "cruzar" la
  // pantalla y el observador no la vería. Una vez por fotograma de scroll se revela todo lo que ya
  // está por encima o dentro de la pantalla, para no dejar nada oculto.
  let catching = false;
  const catchUp = () => {
    catching = false;
    pending.forEach((section) => {
      if (section.classList.contains('is-revealed')) {
        pending.delete(section);
        return;
      }
      if (section.getBoundingClientRect().top < window.innerHeight * 0.92) {
        pending.delete(section);
        observer.unobserve(section);
        reveal(section);
      }
    });
    if (!pending.size) window.removeEventListener('scroll', onScrollCatch);
  };
  const onScrollCatch = () => {
    if (catching) return;
    catching = true;
    requestAnimationFrame(catchUp);
  };
  window.addEventListener('scroll', onScrollCatch, { passive: true });

  /* ---------- 2 y 3. Hero y parallax ---------- */
  const desktopParallax = window.matchMedia('(min-width: 990px) and (hover: hover) and (pointer: fine)');
  const PARALLAX = [
    '.hero__image',
    '.promo-banner__image',
    '.image-with-text__image',
    '.collage__image',
    '.image-with-list__image',
    '.product-information__image',
  ].join(',');
  const PARALLAX_SCALE = 1.12;

  const hero = firstSection?.querySelector('.hero:not(.hero--contained)');
  const visible = new Set();
  let parallaxItems = [];
  let ticking = false;

  const update = () => {
    ticking = false;
    const viewport = window.innerHeight;

    // Lecturas primero, escrituras después (sin reflujos intercalados)
    const reads = [...visible].map((image) => {
      const box = (image.parentElement || image).getBoundingClientRect();
      return [image, box];
    });
    const heroBox = hero ? hero.getBoundingClientRect() : null;

    reads.forEach(([image, box]) => {
      // -1 (abajo) … 1 (arriba): el centro de la foto respecto al centro de la pantalla
      const offset = (box.top + box.height / 2 - viewport / 2) / (viewport / 2 + box.height / 2);
      const travel = (box.height * (PARALLAX_SCALE - 1)) / 2;
      const y = Math.max(-1, Math.min(1, offset)) * -travel * 0.92;
      image.style.setProperty('--py', `${y.toFixed(1)}px`);
    });

    if (hero && heroBox) {
      const exit = Math.max(0, Math.min(1, -heroBox.top / heroBox.height));
      hero.style.setProperty('--hero-exit', exit.toFixed(3));
    }
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  const parallaxObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      requestUpdate();
    },
    { rootMargin: '120px 0px' }
  );

  const enableParallax = () => {
    parallaxItems = [...document.querySelectorAll(`.main-content ${PARALLAX}`)].filter(
      (image) => !image.closest('.shoppable-image, .product-card, .video-card')
    );
    parallaxItems.forEach((image) => {
      image.setAttribute('data-parallax', '');
      image.style.setProperty('--parallax-scale', PARALLAX_SCALE);
      parallaxObserver.observe(image);
    });
  };

  const disableParallax = () => {
    parallaxItems.forEach((image) => {
      parallaxObserver.unobserve(image);
      image.removeAttribute('data-parallax');
      image.style.removeProperty('--parallax-scale');
      image.style.removeProperty('--py');
    });
    parallaxItems = [];
    visible.clear();
  };

  if (desktopParallax.matches) enableParallax();
  desktopParallax.addEventListener('change', (event) => (event.matches ? enableParallax() : disableParallax()));

  if (hero || parallaxItems.length || desktopParallax.matches) {
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
    requestUpdate();
  }

  /* ---------- 5. Progreso de lectura (artículos) ---------- */
  const progress = document.querySelector('[data-reading-progress]');
  const article = document.querySelector('[data-reading-article]');
  if (progress && article) {
    let pending = false;
    const paint = () => {
      pending = false;
      const box = article.getBoundingClientRect();
      const total = box.height - window.innerHeight * 0.6;
      const value = total > 0 ? Math.max(0, Math.min(1, -box.top / total)) : 1;
      progress.style.setProperty('--progress', value.toFixed(4));
    };
    window.addEventListener(
      'scroll',
      () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(paint);
      },
      { passive: true }
    );
    paint();
  }

  // Al imprimir se muestra todo
  window.addEventListener('beforeprint', () => root.classList.remove('js-reveal'));
})();
