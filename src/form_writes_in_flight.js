/***********************************************************************
 *          form_writes_in_flight.js
 *
 *          The writes of topic forms a C_YUI_TREEDB_TOPICS view has sent
 *          and not yet answered, by their `form_write` serial. A form that
 *          waits for its answer (form_waits_for_answer) stays open and
 *          busy until the host answers, so the host has to answer EVERY
 *          way a write ends -- and the transport closing under a write in
 *          flight, or a command that never left because there was no
 *          session, are two of them that nobody answered: the form stayed
 *          busy for ever (N8 of the 2026-09-22 review).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  A write left: remember whose it is
 ************************************************************/
function track_form_write(in_flight, form_write, topic_name)
{
    if(!in_flight || !form_write) {
        return;
    }
    in_flight[form_write] = topic_name || "";
}

/************************************************************
 *  A write was answered, one way or the other
 ************************************************************/
function settle_form_write(in_flight, form_write)
{
    if(!in_flight || !form_write) {
        return;
    }
    delete in_flight[form_write];
}

/************************************************************
 *  Nothing in flight can be answered any more: take them all,
 *  as [{form_write, topic_name}], and leave the map empty.
 ************************************************************/
function abandon_form_writes(in_flight)
{
    const abandoned = [];
    if(!in_flight) {
        return abandoned;
    }
    Object.keys(in_flight).forEach((serial) => {
        abandoned.push({form_write: Number(serial), topic_name: in_flight[serial]});
        delete in_flight[serial];
    });
    return abandoned;
}

export {
    track_form_write,
    settle_form_write,
    abandon_form_writes,
};
