/****************************************************************************
 *          form_time_value.js
 *
 *          A treedb `time` / `now` column is an epoch in SECONDS, and a form
 *          shows it in a `datetime-local` input. These two convert between
 *          them, and they must be each other's inverse: a writable time
 *          column travels back on EVERY save of the record.
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
