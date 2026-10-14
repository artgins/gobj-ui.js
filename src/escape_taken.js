/***********************************************************************
 *          escape_taken.js
 *
 *      Whose is an Escape? The overlay around the focus (a window, the
 *      shell's dialog on top) closes with it -- unless what the key was
 *      typed in took it first:
 *
 *        - a handler used it and said so (`preventDefault()`): Tom
 *          Select closing its list, the json editor its search box;
 *        - an input method is composing (the key cancels the
 *          composition);
 *        - the element it was typed in is no longer in the document:
 *          an inline editor closed with it. Tabulator cancels a cell
 *          edit on Escape by removing the box, and says nothing else
 *          -- so this is the only trace the key leaves;
 *        - it was typed in a search box that holds text: the browser
 *          clears the box with it (a default action, not a
 *          preventDefault() anyone can see -- and taking the key would
 *          prevent it). An empty one gives it on;
 *        - it was typed in a text editor (a textarea, a
 *          contenteditable): what is being written there is not lost
 *          to a key that also means "stop" inside the editor. The
 *          overlay is one Tab away.
 *
 *      Pure module: an event in, a boolean out.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/


/***************************************************************
 *  True when the Escape `evt` belongs to what it was typed in,
 *  and not to the overlay around it.
 ***************************************************************/
export function escape_is_taken(evt)
{
    if(!evt) {
        return false;
    }
    if(evt.defaultPrevented || evt.isComposing) {
        return true;
    }
    let target = evt.target;
    if(!target || target.nodeType !== 1) {
        return false;
    }
    if(target.isConnected === false) {
        return true;
    }
    if(target.tagName === "INPUT" && target.type === "search" && target.value) {
        return true;
    }
    if(target.tagName === "TEXTAREA" || target.isContentEditable === true) {
        return true;
    }
    return false;
}
