/***********************************************************************
 *          yui_uplot_ink.js
 *
 *      The ink of a uPlot chart, on both schemes, and its palette.
 *
 *      uPlot is built for a white page: its axis labels are `#000`
 *      and its grid `rgba(0,0,0,0.07)`, which on the dark scheme are
 *      1.16:1 and 1.04 -- an axis nobody can read and a grid that is
 *      not there. The inks here are handed to uPlot as FUNCTIONS: it
 *      calls them when it draws, so the value can never be stale --
 *      what goes stale is the canvas, and a change of the theme has to
 *      ask for a redraw (yui_watch_theme() turns it into an event).
 *
 *      uPlot ALWAYS draws a Y axis: its setDefaults() makes axes[1]
 *      whether it was given or not, with its own black. So the axes are
 *      padded to two before they are inked. C_YUI_UPLOT's default is
 *      `[{}]`, the X axis alone, and until 7.26.40 every chart of the
 *      library had a Y axis whose values could not be read in the dark.
 *
 *      C_YUI_UPLOT uses it, and so can an app that builds a uPlot of its
 *      own:
 *
 *          import {yui_uplot_axes} from "@yuneta/gobj-ui/src/yui_uplot_ink.js";
 *
 *          const chart = new uPlot({
 *              width: 600, height: 300,
 *              series: [{}, {label: "temperature"}],
 *              axes: yui_uplot_axes([{}]),     // X and Y, with the ink of the theme
 *          }, data, $el);
 *
 *      The palette is six colours that clear 3:1 on BOTH grounds
 *      (worst 3.39 on white, 3.71 on near-black), ordered so the first
 *      two are the pair that survives colour blindness -- blue and
 *      orange, never red and green as the opening pair.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {yui_is_dark} from "./yui_theme.js";

/************************************************************
 *  The ink of the labels of an axis.
 ************************************************************/
function yui_uplot_axis_ink()
{
    return yui_is_dark()? "#c7cdd8" : "#2e333d";
}

/************************************************************
 *  The ink of the grid and of the ticks.
 ************************************************************/
function yui_uplot_grid_ink()
{
    return yui_is_dark()? "rgba(199,205,216,0.16)" : "rgba(46,51,61,0.12)";
}

const YUI_UPLOT_PALETTE = [
    {stroke: "#2f6fd0", fill: "rgba(47,111,208,0.10)"},     /*  4.88 / 3.71  */
    {stroke: "#b8620a", fill: "rgba(184,98,10,0.10)"},      /*  4.38 / 4.13  */
    {stroke: "#2f8f4e", fill: "rgba(47,143,78,0.10)"},      /*  4.07 / 4.45  */
    {stroke: "#8b5cf6", fill: "rgba(139,92,246,0.10)"},     /*  4.23 / 4.28  */
    {stroke: "#0e9aa7", fill: "rgba(14,154,167,0.10)"},     /*  3.39 / 5.35  */
    {stroke: "#d1344b", fill: "rgba(209,52,75,0.10)"},      /*  4.88 / 3.71  */
];

/************************************************************
 *  The axes the host asked for -- at least the X and the Y,
 *  the two uPlot always draws -- with the ink it did not ask
 *  about. A stroke, a grid or a ticks the host gave is kept.
 *  Answers new objects: the host's are not touched.
 ************************************************************/
function yui_uplot_axes(axes)
{
    let list = Array.isArray(axes)? axes.slice() : [axes || {}];
    while(list.length < 2) {
        list.push({});
    }
    return list.map((ax) => {
        let a = Object.assign({}, ax || {});
        if(a.stroke === undefined) {
            a.stroke = yui_uplot_axis_ink;
        }
        a.grid = Object.assign({stroke: yui_uplot_grid_ink}, a.grid || {});
        a.ticks = Object.assign({stroke: yui_uplot_grid_ink}, a.ticks || {});
        return a;
    });
}

export {
    yui_uplot_axes,
    yui_uplot_axis_ink,
    yui_uplot_grid_ink,
    YUI_UPLOT_PALETTE,
};
