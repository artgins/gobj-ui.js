/***********************************************************************
 *          form_writes_in_flight.js
 *
 *          The writes of topic forms a C_YUI_TREEDB_TOPICS view has sent
 *          and not yet answered. A form that waits for its answer
 *          (form_waits_for_answer) stays open and busy until the host
 *          answers, so the host has to answer EVERY way a write ends --
 *          and the transport closing under a write in flight, or a
 *          command that never left because there was no session, are two
 *          of them that nobody answered: the form stayed busy for ever
 *          (N8 of the 2026-09-22 review).
 *
 *          A write is known by its TOPIC and its `form_write` serial,
 *          never by the serial alone: each topic has its own form, and
 *          each form counts its serials from 1. Keyed by the serial, two
 *          forms with a write in flight at once shared the key "1", the
 *          first answer settled both, and the transport closing then
 *          answered only one of them.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  The key of one write: `<topic>^<serial>`.
 ************************************************************/
function form_write_key(topic_name, form_write)
{
    return `${topic_name || ""}^${form_write}`;
}

/************************************************************
 *  A write left: remember whose it is
 ************************************************************/
function track_form_write(in_flight, form_write, topic_name)
{
    if(!in_flight || !form_write) {
        return;
    }
    in_flight[form_write_key(topic_name, form_write)] = {
        form_write: form_write,
        topic_name: topic_name || ""
    };
}

/************************************************************
 *  A write was answered, one way or the other. True when it was
 *  still in flight: false when something else answered it already
 *  (the transport closing, abandon_form_writes), so its form must
 *  not be answered twice.
 ************************************************************/
function settle_form_write(in_flight, form_write, topic_name)
{
    if(!in_flight || !form_write) {
        return false;
    }
    const key = form_write_key(topic_name, form_write);
    if(!Object.prototype.hasOwnProperty.call(in_flight, key)) {
        return false;
    }
    delete in_flight[key];
    return true;
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
    Object.keys(in_flight).forEach((key) => {
        const w = in_flight[key];
        abandoned.push({form_write: Number(w.form_write), topic_name: w.topic_name});
        delete in_flight[key];
    });
    return abandoned;
}

export {
    track_form_write,
    settle_form_write,
    abandon_form_writes,
};
