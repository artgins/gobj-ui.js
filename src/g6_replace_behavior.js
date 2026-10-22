/***********************************************************************
 *          g6_replace_behavior.js
 *
 *          Replace one of G6's built-in behaviors, without a warning on
 *          every page load.
 *
 *          gobj-ui replaces two built-ins on purpose (`drag-canvas` and
 *          `zoom-canvas`, the touch round of 7.23.9), so that every graph
 *          gets the fix without touching its behaviors list. G6's
 *          `register()` warns whenever a type is registered again --
 *          "The extension drag-canvas of behavior has been registered
 *          before, and will be overridden" -- and its `print` is not
 *          exported, so the warning cannot be muted. It went to the
 *          console of every app that draws a graph, on every load.
 *
 *          `getExtensions(category)` hands out G6's live registry, so the
 *          replacement is written there. Whether it took is checked with
 *          `getExtension()`: a G6 that hands out a copy one day gets the
 *          replacement through `register()` -- with its warning, which
 *          then says something -- instead of losing it in silence.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    ExtensionCategory,
    getExtension,
    getExtensions,
    register,
} from '@antv/g6';

/************************************************************
 *  Make `Ctor` the behavior `type`, replacing the built-in.
 ************************************************************/
function replace_g6_behavior(type, Ctor)
{
    const category = ExtensionCategory.BEHAVIOR;
    const behaviors = getExtensions(category);
    if(behaviors && getExtension(category, type)) {
        behaviors[type] = Ctor;
    }
    if(getExtension(category, type) !== Ctor) {
        register(category, type, Ctor);
    }
}

export {replace_g6_behavior};
