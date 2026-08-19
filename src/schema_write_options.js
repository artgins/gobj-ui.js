/***********************************************************************
 *          schema_write_options.js
 *
 *      The OPTIONS a schema write travels with, and why each one.
 *
 *      Three words decide whether a write does what it says, and all
 *      three are easy to get wrong in a way that succeeds:
 *
 *      `create`    a node that is not there yet is written by
 *                  `update-node` with this, not by `create-node`. The
 *                  two are not the same call: only the update path
 *                  carries `autolink`, and without a link a new column
 *                  belongs to no topic.
 *
 *      `autolink`  turns the fkey carried IN THE RECORD into a link.
 *                  It rewrites the node's links from the fkey fields
 *                  the record has — so on a PARTIAL update, which
 *                  carries none, it reads that as "no parents" and
 *                  UNLINKS the node. Raising a topic's version with it
 *                  on detached that topic from its treedb, and the
 *                  write returned success. It goes with a create,
 *                  where the record carries its fkey, and with nothing
 *                  else.
 *
 *      `force`     a delete of a node something points at. A column is
 *                  pointed at by the topic that owns it, which is not
 *                  a reason to refuse.
 *
 *      Pure and tested, because the cost of getting it wrong is a
 *      store that has to be repaired by hand, and nothing in the
 *      answer says it happened.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/***************************************************************
 *  write_command(op) -> the treedb command that performs it
 ***************************************************************/
function write_command(op)
{
    return (op === "delete") ? "delete-node" : "update-node";
}

/***************************************************************
 *  write_options(op) -> the options it travels with
 ***************************************************************/
function write_options(op)
{
    if(op === "delete") {
        return {force: true};
    }
    if(op === "create") {
        return {list_dict: true, create: true, autolink: true};
    }
    return {list_dict: true};
}


export {write_command, write_options};
