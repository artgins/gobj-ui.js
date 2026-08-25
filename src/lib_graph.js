/***********************************************************************
 *          lib_graph.js
 *
 *          Utilities for graph, using Bulma
 *
 *          Copyright (c) 2025, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    gobj_read_attr,
    log_error,
} from "@yuneta/gobj-js";

// import {t} from "i18next";
import "./lib_graph.css";

/************************************************************
 *  Add class to elements selected
 ************************************************************/
function addClasses($container, selector, ...classNames)
{
    $container.querySelectorAll(selector).forEach(el =>
        el.classList.add(...classNames)
    );
}

/************************************************************
 *  Remove class from elements selected
 ************************************************************/
function removeClasses($container, selector, ...classNames)
{
    $container.querySelectorAll(selector).forEach(el =>
        el.classList.remove(...classNames)
    );
}

/************************************************************
 *  Toggle class to elements selected
 ************************************************************/
function toggleClasses($container, selector, ...classNames)
{
    $container.querySelectorAll(selector).forEach(el =>
        classNames.forEach(cls => el.classList.toggle(cls))
    );
}

/************************************************************
 *  Remove child elements
 ************************************************************/
function removeChildElements($element)
{
    $element.innerHTML = '';  // Remove all children
}

/************************************************************
 *  Disable/Enable elements
 ************************************************************/
function disableElements($container, selector)
{
    $container.querySelectorAll(selector).forEach(el => {
        el.setAttribute('disabled', '');
    });
}

function enableElements($container, selector)
{
    $container.querySelectorAll(selector).forEach(el => {
        if(el.hasAttribute('disabled')) {
            el.removeAttribute('disabled');
        }
    });
}

/************************************************************
 *  Set or reset the color of 'enable submit action' state
 *  Color green
 ************************************************************/
function set_submit_state($container, selector, set)
{
    if(set) {
        addClasses($container, selector, "color_submit_state");
    } else {
        removeClasses($container, selector, "color_submit_state");
    }
}

/************************************************************
 *  Set or reset the color of 'enable cancel action' state
 *  Color red
 ************************************************************/
function set_cancel_state($container, selector, set)
{
    if(set) {
        addClasses($container, selector, "color_cancel_state");
    } else {
        removeClasses($container, selector, "color_cancel_state");
    }
}

/************************************************************
 *  Set or reset the color of 'enable actived' state
 *  Color orange
 ************************************************************/
function set_active_state($container, selector, set)
{
    if(set) {
        addClasses($container, selector, "color_active_state");
    } else {
        removeClasses($container, selector, "color_active_state");
    }
}

/************************************************************
 *  Set or reset the 'pressed' state of a TOGGLE.
 *
 *  Not one of the colours above: each of those names a KIND of
 *  action (create, pending, history, destructive), and a toggle
 *  is not an action -- it is a state the control is IN. So it
 *  looks pressed instead of changing category, which also keeps
 *  it out of the way of a neighbour wearing the same hue.
 ************************************************************/
function set_pressed_state($container, selector, set)
{
    if(set) {
        addClasses($container, selector, "pressed_state");
    } else {
        removeClasses($container, selector, "pressed_state");
    }
}

/**
 * Returns a smart stroke color in `rgba()` format based on:
 * - The given fill color (hex or rgb[a])
 * - The current theme ('light' or 'dark')
 * - The adjustment factor (default 0.2)
 *
 * @param {string} fillColor - Fill color string
 * @param {string} theme - 'light' or 'dark'
 * @param {number} factor - Lighten/darken factor (default 0.2)
 * @returns {string} rgba(r, g, b, a)
 */
function getStrokeColor(fillColor, theme = 'light', factor = 0.2) {
    let r, g, b, a = 1;

    if(fillColor.startsWith('#')) {
        let hex = fillColor.slice(1);
        if(hex.length === 3 || hex.length === 4) {
            hex = hex.split('').map(c => c + c).join('');
        }

        if(hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else if(hex.length === 8) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
            a = parseInt(hex.slice(6, 8), 16) / 255;
        } else {
            throw new Error("Unsupported hex format");
        }
    } else if(fillColor.startsWith('rgb')) {
        const match = fillColor.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
        if(!match) {
            throw new Error("Invalid rgb()/rgba() format.");
        }
        r = parseInt(match[1], 10);
        g = parseInt(match[2], 10);
        b = parseInt(match[3], 10);
        if(match[4] !== undefined) {
            a = parseFloat(match[4]);
        }
    } else {
        throw new Error("Unsupported color format.");
    }

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    let lighten;
    if(theme === 'dark') {
        // In dark mode, prefer lighter strokes
        lighten = luminance < 0.7;
    } else {
        // In light mode, prefer darker strokes
        lighten = luminance < 0.3;
    }

    const adjust = (v) => lighten
        ? Math.min(255, Math.floor(v + (255 - v) * factor))
        : Math.max(0, Math.floor(v * (1 - factor)));

    return `rgba(${adjust(r)}, ${adjust(g)}, ${adjust(b)}, ${a.toFixed(3)})`;
}

//=======================================================================
//      Expose the class via the global object
//=======================================================================
/************************************************************
 * Returns the proportional position (between 0 and 1) of a specific point,
 * centered and spaced with margins.
 *
 * index - Index of the point (0 to count-1)
 * count - Total number of points
 * margin - Total margin space (default 0.2 means 10% on each end)
 ************************************************************/
function getPointPosition(count, index, margin = 0.2)
{
    if(count <= 0 || index < 0 || index >= count) {
        log_error("Invalid count or index");
        return 0.5;
    }

    const start = margin / 2;
    const end = 1 - margin / 2;
    const step = (end - start) / count;

    return start + index * step + step / 2;
}

/************************************************************
 *  Count hooks and fkeys in topic desc, classify node type
 ************************************************************/
function calculate_hooks_fkeys_counter(desc)
{
    let cols = desc.cols;
    desc.hooks_counter = 0;
    desc.fkeys_counter = 0;

    for(let i=0; i<cols.length; i++) {
        let col = cols[i];
        const field_desc = treedb_get_field_desc(col);
        switch(field_desc.type) {
            case "hook":
                desc.hooks_counter++;
                break;
            case "fkey":
                desc.fkeys_counter++;
                break;
        }
    }

    if(desc.hooks_counter === 0) {
        desc.node_treedb_type = 'child';
    } else if(desc.fkeys_counter === 0) {
        desc.node_treedb_type = 'extended';
    } else {
        desc.node_treedb_type = 'hierarchical';
    }
}

export {
    addClasses,
    removeClasses,
    toggleClasses,
    removeChildElements,
    disableElements,
    enableElements,
    set_submit_state,
    set_cancel_state,
    set_active_state,
    set_pressed_state,
    getStrokeColor,
    getPointPosition,
};
