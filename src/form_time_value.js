/****************************************************************************
 *          form_time_value.js
 *
 *          A treedb `time` / `now` column is an epoch in SECONDS, and a form
 *          shows it in a `datetime-local` input. These two convert between
 *          them, and they must be each other's inverse: a writable time
 *          column travels back on EVERY save of the record.
 *
 *          KNOWN LIMIT -- the change of hour. A `datetime-local` holds a
 *          LOCAL WALL time and no offset, and a wall time is not always
 *          one instant:
 *
 *            - the night the clocks go back (autumn), one hour happens
 *              twice. "02:30" names two instants an hour apart, and
 *              `new Date("YYYY-MM-DDT02:30:00")` answers the EARLIER one
 *              (ECMAScript's "compatible" disambiguation). An epoch in the
 *              SECOND pass of that hour is shown as 02:30 and comes back
 *              one hour earlier. So neither the form's field nor the cell
 *              editor reads a box that still shows what it was filled
 *              with: they give back the value it was filled from (up to
 *              gobj-ui 7.26.48 the cell, and 7.26.50 the field, wrote
 *              -3600 s on a save of any field of the record).
 *            - the night the clocks go forward (spring), one hour does not
 *              exist. No epoch is shown in it, so nothing read comes back
 *              wrong; a wall time TYPED in it is moved forward by the
 *              browser.
 *
 *          Not fixable here without the offset, which the input cannot
 *          carry. What is safe: a read-only time column never goes back
 *          (treedb_write_plan.js, col_goes_back_to_treedb), and a time
 *          pkey2 goes back as the record had it, never through this
 *          widget (instance_keys_of). A wall time TYPED inside the
 *          repeated hour is the exposed case: it is the first pass.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ****************************************************************************/
import {fmt_date_time} from "./yui_time.js";

/************************************************************
 *  A Date -> the value of a `datetime-local` input, in local time,
 *  WITH seconds: the input is built with `step: 1`, which is what
 *  lets it hold them. Written as "YYYY-MM-DDTHH:mm" it lost them on
 *  every save of any field.
 ************************************************************/
function date_to_datetime_local(value)
{
    if(!(value instanceof Date) || isNaN(value.getTime())) {
        return "";
    }
    let pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}` +
        `-${pad(value.getDate())}T` +
        `${pad(value.getHours())}:${pad(value.getMinutes())}` +
        `:${pad(value.getSeconds())}`;
}

/************************************************************
 *  The value of a `datetime-local` input -> epoch in seconds
 ************************************************************/
function datetime_local_to_epoch(value)
{
    if(!value) {
        return null;
    }
    const date = new Date(value);
    if(isNaN(date.getTime())) {
        return null;
    }
    return Math.floor(date.getTime() / 1000);
}

/************************************************************
 *  The value of a time column -> a Date, or null when it holds
 *  none. A `string` column holds an ISO text, any other an epoch
 *  in SECONDS. The form's time field and the cell editor of a
 *  table read it here, so the two agree: up to gobj-ui 7.26.46 the
 *  field read every column with parseInt -- an ISO text as the
 *  year 2026 in SECONDS, in January 1970 -- and showed an empty
 *  one as January 1970 too, which a save then wrote back as 0.
 ************************************************************/
function time_value_to_date(value, real_type)
{
    if(value === null || value === undefined || value === "") {
        return null;
    }
    let date = (real_type === "string")?
        new Date(String(value)) : new Date(Number(value) * 1000);
    return isNaN(date.getTime())? null : date;
}

/************************************************************
 *  An epoch in seconds (null: no time) -> the value of a time
 *  column: an ISO text for a `string` column, the epoch for any
 *  other. Up to gobj-ui 7.26.46 the field wrote the epoch into a
 *  `string` column too.
 ************************************************************/
function epoch_to_time_value(epoch, real_type)
{
    if(epoch === null || epoch === undefined) {
        return null;
    }
    if(typeof epoch !== "number" || !Number.isFinite(epoch)) {
        return epoch;   // not an epoch: handed on as it came
    }
    if(real_type === "string") {
        return new Date(epoch * 1000).toISOString();
    }
    return epoch;
}

/************************************************************
 *  The value of a time column as a table cell shows it: the
 *  local clock, 24 hours, in the APP's language `locale`
 *  (fmt_date_time() of yui_time.js: es "14 oct 2026, 15:05:09").
 *  Up to gobj-ui 7.26.51 the form wrote "2026-10-14 15:05:09" and
 *  the treedb table "14 oct 2026, 03:05:09 p. m.", in the
 *  browser's language. "" for no time; a value that is not one is
 *  shown as it is, so the reader sees what the column holds.
 ************************************************************/
function time_value_to_text(value, real_type, locale)
{
    let date = time_value_to_date(value, real_type);
    if(!date) {
        return (value === null || value === undefined)? "" : String(value);
    }
    return fmt_date_time(date, locale);
}

export {
    date_to_datetime_local, datetime_local_to_epoch,
    time_value_to_date, epoch_to_time_value, time_value_to_text
};
