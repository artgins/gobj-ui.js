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
 *              one hour earlier: saving the record -- any field of it --
 *              moves a writable time column that holds it by -3600 s.
 *            - the night the clocks go forward (spring), one hour does not
 *              exist. No epoch is shown in it, so nothing read comes back
 *              wrong; a wall time TYPED in it is moved forward by the
 *              browser.
 *
 *          Not fixable here without the offset, which the input cannot
 *          carry. What is safe: a read-only time column never goes back
 *          (treedb_write_plan.js, col_goes_back_to_treedb), and a time
 *          pkey2 goes back as the record had it, never through this
 *          widget (instance_keys_of). A writable time column edited or
 *          merely saved inside the repeated hour is the exposed case.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ****************************************************************************/

/************************************************************
 *  A Date -> the value of a `datetime-local` input, in local time,
 *  WITH seconds: the input is built with `step: 1`, which is what
 *  lets it hold them. Written as "YYYY-MM-DDTHH:mm" it lost them on
 *  every save of any field (M26 of the 2026-09-21 review).
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

export {date_to_datetime_local, datetime_local_to_epoch};
