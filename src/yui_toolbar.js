/*
 *  A horizontal toolbar with a hidden scrollbar and auto-appearing
 *  left/right scroll arrows.
 *
 *  Using Bulma Framework (https://bulma.io)
 *
 *  attrs: attributes for the outer <div> of yui-horizontal-toolbar
 *         (the caller's object is not mutated).
 *  items: [[createElement2() output or parameters of createElement2]]
 */
/* global ResizeObserver */

import {
    createElement2, debounce
} from "@yuneta/gobj-js";

import {t} from "i18next";

import "./yui_toolbar.css"; // Must be in index.js ?

import {yui_toolbar_icon, YUI_TOOLBAR_ICON_SIZE} from "./yui_toolbar_icon.js";


function yui_toolbar(attrs={}, items = [])
{
    /*
     *  Scroll arrow buttons: use the repo icon set (yi-chevron-*), colored
     *  via currentColor so both themes work; never a hardcoded fill.
     */
    function arrow_button(side, icon, label)
    {
        return ['button',
            {
                class: `yui-horizontal-toolbar-scroll-btn ${side} has-text-link`,
                /*  Start hidden: only shown once we know the content overflows,
                 *  never a flash of both arrows on a toolbar that doesn't scroll. */
                style: 'display:none',
                type: 'button',
                /*  Translated HERE, not left as the raw key for the host to
                 *  repaint: a toolbar is rebuilt on every action it carries
                 *  (a mode, a chip, a filter), and a host that translates its
                 *  view once at mount never sees the rebuilt arrows again.
                 *  Read back on a deployed Spanish map, where the strip that
                 *  scrolls the family chips offered "scroll left". The keys
                 *  stay on the element so a language change still reaches
                 *  them through refresh_language(). */
                title: t(label),
                'aria-label': t(label),
                'data-i18n-title': label,
                'data-i18n-aria-label': label
            },
            [['span', {class: 'icon'}, [['i', {class: icon}]]]],
            {
                click: side === 'left' ? cb_left_arrow : cb_right_arrow
            }
        ];
    }

    /*
     *  Don't mutate the caller's attrs object.
     */
    const div_attrs = {...attrs};
    div_attrs.class = div_attrs.class ?
        `yui-horizontal-toolbar ${div_attrs.class}` : 'yui-horizontal-toolbar';

    // Create the toolbar container
    let $toolbar = createElement2(['div', div_attrs, [
        arrow_button('left',  'yi-chevron-left',  'scroll left'),
        ['div', {class: 'yui-horizontal-toolbar-container'}, items],
        arrow_button('right', 'yi-chevron-right', 'scroll right')
    ]]);

    let $container = $toolbar.querySelector('.yui-horizontal-toolbar-container');
    let $leftButton = $toolbar.querySelector('.yui-horizontal-toolbar-scroll-btn.left');
    let $rightButton = $toolbar.querySelector('.yui-horizontal-toolbar-scroll-btn.right');

    /*
     *  Scroll by most of the visible width so a click makes a real jump,
     *  with a sane floor when the toolbar is very narrow.
     */
    function scroll_step() {
        return Math.max(80, Math.round($container.clientWidth * 0.8));
    }
    function cb_left_arrow(evt) {
        evt.stopPropagation();
        $container.scrollBy({left: -scroll_step(), behavior: 'smooth'});
    }
    function cb_right_arrow(evt) {
        evt.stopPropagation();
        $container.scrollBy({left: scroll_step(), behavior: 'smooth'});
    }

    let wasConnected = false;
    function updateScrollButtons() {
        if($container.isConnected) {
            wasConnected = true;
        } else if(wasConnected) {
            /*
             *  Detached AFTER having been live: stop observing so the toolbar
             *  subtree can be garbage collected (the observer's only tie is
             *  $container). Before the first insertion the node is legitimately
             *  disconnected — fall through and compute (widths are 0, so both
             *  arrows resolve to hidden), never disconnect pre-emptively.
             */
            observer.disconnect();
            debouncedResize.cancel();
            return;
        }
        const tolerance = 1; /* sub-pixel rounding of scrollLeft */
        const isScrollable = $container.scrollWidth > $container.clientWidth + tolerance;
        const atStart = $container.scrollLeft <= tolerance;
        const atEnd = $container.scrollLeft >=
            $container.scrollWidth - $container.clientWidth - tolerance;
        /*
         *  Empty string (not 'none'/'block') lets the CSS `display:flex`
         *  reassert and keep the arrow centered.
         */
        $leftButton.style.display = isScrollable && !atStart ? '' : 'none';
        $rightButton.style.display = isScrollable && !atEnd ? '' : 'none';
    }

    $container.addEventListener('scroll', updateScrollButtons);

    /*
     *  Observe the container itself (NOT document.body): it delivers an
     *  initial callback once the toolbar is laid out and fires whenever the
     *  available width changes, and it does not pin the subtree to the
     *  page-lifetime <body>.
     */
    const debouncedResize = debounce(updateScrollButtons, 300);
    const observer = new ResizeObserver(() => {
        debouncedResize();
    });
    observer.observe($container);

    updateScrollButtons();

    return $toolbar;
}

/************************************************************
 *  Set or reset the PRESSED state of a toggle.
 *
 *  It lives here, with `yui_toolbar.css`, and not in
 *  `lib_graph.js` where it was born: a pressed toggle is a
 *  TOOLBAR thing, and a stylesheet rides its JS import -- while
 *  the rule sat in the graph's file, an app without a graph got
 *  the class and no paint, which from the outside is a button
 *  that does not work. `lib_graph.js` re-exports it, so every
 *  caller written against that path keeps working.
 *
 *  Written with `querySelectorAll` and not with `addClasses`
 *  from `lib_graph.js` on purpose: importing that would drag
 *  `lib_graph.css` into every toolbar, which is the same trap
 *  the other way round.
 ************************************************************/
function set_pressed_state($container, selector, set)
{
    if(!$container) {
        return;
    }
    $container.querySelectorAll(selector).forEach(($el) => {
        $el.classList.toggle("pressed_state", !!set);
    });
}

/************************************************************
 *  Set or reset the CHOSEN state of one segment of a selector.
 *
 *  Not the same control as a toggle, and not the same mark: a
 *  toggle is on or off and looks pressed (a neutral pill, no
 *  hue, because there is no "which one" to answer); a selector
 *  picks ONE of N and fills the chosen segment with the link
 *  colour, which is what the eye finds in a row of identical
 *  grey buttons. See `yui_toolbar.css` for the measurements.
 ************************************************************/
function set_selected_state($container, selector, set)
{
    if(!$container) {
        return;
    }
    $container.querySelectorAll(selector).forEach(($el) => {
        $el.classList.toggle("selected_state", !!set);
    });
}

export {yui_toolbar, yui_toolbar_icon, YUI_TOOLBAR_ICON_SIZE,
        set_pressed_state, set_selected_state};
