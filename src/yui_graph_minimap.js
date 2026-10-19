/***********************************************************************
 *          yui_graph_minimap.js
 *
 *  The minimap of a G6 graph, drawn the same way in every graph of the
 *  library: where it sits, the frame it wears in each theme, and how
 *  it shows the part of the graph that is on screen.
 *
 *  It came from the treedb graph (`c_g6_nodes_tree.js`), where each of
 *  these decisions was paid for, and moved here when the gobj tree
 *  needed one too: two graphs side by side in the same console with
 *  two different minimaps is the drift `yui_graph_camera.js` exists to
 *  stop.
 *
 *  What stays with each graph is WHEN it shows one (both decide by the
 *  number of nodes) and the colour of each block -- a topic's colour
 *  in one, a role's in the other.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {Rect as RectGeometry} from '@antv/g';


/************************************************************
 *  The options of G6's `minimap` plugin, with `shape` drawing
 *  each element: `(id, element_type, element) => shape`.
 *
 *  The shapes are the caller's because G6's minimap clones each
 *  element's KEY shape into its own canvas, and in an `html` node
 *  the key shape is a DOM element, which clones into nothing. A
 *  block of the node's size (yui_graph_minimap_block()) is also
 *  what a minimap of cards should show: at that scale a card is a
 *  rectangle anyway.
 ************************************************************/
export function yui_graph_minimap_options(shape)
{
    return {
        size: [200, 140],
        position: "bottom-left",
        /*
         *  The anchor has to be CSS, not the pixels G6 computes.
         *
         *  `createPluginCanvas` turns `position` into `left`/`top`
         *  in PIXELS, once, from the canvas size at creation
         *  (`xRatio * (W - width)`). The container then grows --
         *  full screen, a window resize, a panel closing -- and the
         *  minimap stays at the `top` it was given: measured going
         *  full screen, `top` was still `511px` over a container
         *  that had become 768 tall, which put it floating halfway
         *  up the left edge, on top of the graph it is there to
         *  explain.
         *
         *  `containerStyle` is merged AFTER those pixels, so
         *  `top: auto` + `bottom` is a real anchor the browser
         *  keeps for every size the container ever takes.
         *
         *  And it follows the theme: G6's default is a `#fff` box
         *  with a `#ddd` border in BOTH themes, which over a
         *  near-black canvas is the brightest thing on screen.
         */
        containerStyle: {
            top:          "auto",
            bottom:       "12px",
            left:         "12px",
            background:   "var(--bulma-scheme-main, #fff)",
            /*  A mid grey and not a `--bulma-border-*` token: those
             *  are made for a line INSIDE a surface, and this one has
             *  to separate a floating panel from the CANVAS behind
             *  it -- which is near-black in one scheme and white in
             *  the other. `border-weak` was 1.43:1 over the dark
             *  canvas and 1.18 over the light one; every border token
             *  fails at least one of them. This one is 4.6 on both.
             *  (The box-shadow below separates it only where there
             *  is light to cast a shadow on.)  */
            border:       "1px solid var(--bulma-text-weak, #94a3b8)",
            borderRadius: "6px",
            boxShadow:    "0 2px 8px rgba(0, 0, 0, 0.15)",
        },
        /*  The viewport rectangle: G6 washes it in black, which is
         *  invisible over a dark minimap. A link-coloured outline
         *  reads on both.  */
        maskStyle: {
            border:     "2px solid var(--bulma-link-on-scheme, var(--bulma-link, #3b82f6))",
            background: "rgba(59, 130, 246, 0.12)",
        },
        shape: shape,
    };
}

/************************************************************
 *  One node of the minimap: a block of the node's size,
 *  centred where the node is, filled with `fill`.
 *
 *  `node_data` is G6's (graph.getNodeData(id)); a node with no
 *  size of its own gets a card's.
 ************************************************************/
export function yui_graph_minimap_block(node_data, fill)
{
    let size = (node_data && node_data.style && node_data.style.size) || [120, 60];
    return new RectGeometry({
        style: {
            x: -size[0] / 2,
            y: -size[1] / 2,
            width: size[0],
            height: size[1],
            fill: fill,
            radius: 4
        }
    });
}

/************************************************************
 *  Paint a minimap again from where the nodes are NOW.
 *
 *  It repaints off the graph's draw events, and a layout emits
 *  none: G6 moves the nodes with a SILENT draw. So after a layout
 *  the minimap goes on showing the arrangement before it until it
 *  is told. It throws what G6 throws: the caller catches it, and
 *  its log says whose minimap it was.
 ************************************************************/
export function yui_graph_minimap_repaint(plugin)
{
    if(!plugin || plugin.destroyed) {
        return;
    }
    plugin.renderMinimap();
    plugin.renderMask();
}
