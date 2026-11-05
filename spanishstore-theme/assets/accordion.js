/*
 * Acordeones animados (preguntas del FAQ: sections/faq.liquid y snippets/faq-item.liquid).
 * Marcado: <details data-accordion> con <summary> y el contenido en [data-accordion-content].
 * Sigue siendo un <details> nativo (accesible y funciona sin JavaScript); aquí solo se anima:
 * - al abrir, la altura crece con suavidad y la respuesta entra desvaneciéndose desde arriba;
 * - al cerrar, la respuesta se desvanece y la altura se recoge; el <details> se cierra al terminar
 *   (mientras tanto lleva la clase "is-collapsing", que el CSS usa para girar ya el icono).
 * Si se pulsa a mitad de animación, la nueva parte de la altura actual (sin saltos).
 * Con "reducir movimiento" se deja el comportamiento nativo.
 * Puede incluirse desde varias secciones: solo se registra una vez.
 */
(() => {
  if (window.themeAccordion) return;
  window.themeAccordion = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

  const height = (element) => element.getBoundingClientRect().height;

  const toggle = (details, open) => {
    const content = details.querySelector('[data-accordion-content]');
    // Altura de partida: la que se ve ahora (aunque haya una animación en curso)
    const start = height(details);
    details.accordionAnimation?.cancel();
    details.contentAnimation?.cancel();
    details.classList.remove('is-collapsing');

    // Alturas abierto y cerrado
    details.open = true;
    const openHeight = height(details);
    details.open = false;
    const closedHeight = height(details);
    details.open = true;

    details.style.overflow = 'hidden';
    if (!open) details.classList.add('is-collapsing');

    const animation = details.animate(
      { height: [`${start}px`, `${open ? openHeight : closedHeight}px`] },
      { duration: open ? 480 : 360, easing: open ? EASE : 'cubic-bezier(0.65, 0, 0.35, 1)' }
    );
    details.accordionAnimation = animation;

    if (content) {
      details.contentAnimation = open
        ? content.animate(
            { opacity: [0, 1], transform: ['translateY(-0.625rem)', 'none'] },
            { duration: 420, delay: 80, easing: EASE, fill: 'backwards' }
          )
        : content.animate(
            { opacity: [1, 0], transform: ['none', 'translateY(-0.375rem)'] },
            { duration: 220, easing: 'ease', fill: 'forwards' }
          );
    }

    animation.onfinish = () => {
      details.accordionAnimation = null;
      details.style.overflow = '';
      if (!open) {
        details.open = false;
        details.classList.remove('is-collapsing');
        details.contentAnimation?.cancel();
      }
    };
  };

  document.addEventListener('click', (event) => {
    const summary = event.target.closest('details[data-accordion] > summary');
    if (!summary || reduceMotion.matches) return;
    const details = summary.parentElement;
    if (typeof details.animate !== 'function') return;
    event.preventDefault();
    // Abierto (y no cerrándose) → cerrar; en otro caso → abrir
    const isOpen = details.open && !details.classList.contains('is-collapsing');
    toggle(details, !isOpen);
  });
})();
