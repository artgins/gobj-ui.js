/***********************************************************************
 *          c_yui_service_view.js
 *
 *      Mounting a view that TALKS TO A BACKEND.
 *
 *      THE PROBLEM
 *      -----------
 *      A view that asks the backend for data does it with
 *          gobj_command(remote, "...", kw, src = itself)
 *      and C_IEVENT_CLI routes the answer back with
 *          gobj_find_service(gobj_name(src))
 *      which only finds REGISTERED SERVICES.
 *
 *      Neither host creates one: C_YUI_SHELL mounts a route's view with
 *      `gobj_create()` and C_YUI_NODE with `gobj_create_pure_child()`.
 *      So a backend-talking view mounted directly never receives a single
 *      answer — and not quietly: the ievent logs "service not found" once
 *      per answer while the view sits empty forever.
 *
 *      There is a second half.  A route's `target.kw` is STATIC JSON, so
 *      it cannot carry the live transport pointer the view needs.  It has
 *      to be resolved at mount time and injected.
 *
 *      THE PIECE
 *      ---------
 *      Both halves had been written four separate times, in three repos,
 *      each wrapper saying the same thing in its own header.  They are
 *      here now, in two shapes, because the four callers are not alike:
 *
 *        yui_mount_service_view(host, spec) — the helper.  For a wrapper
 *          that has its OWN extras on top (bridging url segments to the
 *          hosted view, rebinding it when a connection drops).  Those
 *          extras are app or route logic and do NOT belong here; the
 *          wrapper keeps them and drops only the boilerplate.
 *
 *        C_YUI_SERVICE_VIEW — the gclass, for a route with NO extras:
 *          declare it in the route/node and name the view it hosts.  It
 *          is the helper plus a lifecycle, nothing more.
 *
 *      CONTRACT of the hosted gclass:
 *        - declares the attr the transport is injected under
 *          (`gobj_remote_yuno` by default),
 *        - builds its `$container` in mt_create (re-exposed as the
 *          host's, which is what the shell/node mounts),
 *        - flags EVF_PUBLIC_EVENT on what arrives from the backend
 *          (EV_MT_COMMAND_ANSWER and anything the remote publishes): the
 *          ievent drops events that are not public.
 *
 *      NAMES: the service name must be UNIQUE per mount.  A duplicate is
 *      not fatal and that is the danger — gobj-js logs "service ALREADY
 *      REGISTERED. Will be UPDATED" and REBINDS the name, so the answers
 *      of one view would land in the other.  Derive it from the route (or
 *      from whatever else makes the mount unique: a connection id, a
 *      workspace) and never from the gclass alone.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    gclass_find_by_name,
    log_error,
    gobj_parent,
    gobj_read_attr,
    gobj_read_str_attr,
    gobj_read_pointer_attr,
    gobj_write_attr,
    gobj_subscribe_event,
    gobj_find_service,
    gobj_create_service,
    gobj_start,
    gobj_stop,
    gobj_is_running,
    gobj_short_name,
    is_gobj,
    is_string,
    empty_string,
    createElement2,
} from "@yuneta/gobj-js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_SERVICE_VIEW";

/*  What the four wrappers all did: the app's single transport, injected
 *  under the attr every backend-talking gclass in this library declares. */
const DEFAULT_TRANSPORT_SERVICE = "__remote_service__";
const DEFAULT_TRANSPORT_ATTR    = "gobj_remote_yuno";


/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "view_gclass",  0,  "",     "GClass of the hosted view (must be registered)"),
SDATA(data_type_t.DTP_STRING,   "service_name", 0,  "",     "Service name of the hosted view — UNIQUE per mount"),
SDATA(data_type_t.DTP_JSON,     "view_kw",      0,  null,   "kw passed to the hosted view"),
SDATA(data_type_t.DTP_STRING,   "transport_service", 0, DEFAULT_TRANSPORT_SERVICE, "Service name of the live transport"),
SDATA(data_type_t.DTP_STRING,   "transport_attr",    0, DEFAULT_TRANSPORT_ATTR,    "Attr of the hosted view the transport is injected under"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement"),
SDATA_END()
];

let PRIVATE_DATA = {
    view: null,
};

let __gclass__ = null;




                    /***************************
                     *      Public helper
                     ***************************/




/************************************************************
 *  Create `spec.gclass` as a NAMED SERVICE under `host`, with the
 *  live transport injected, and return it (null on failure, error
 *  already logged).  The caller owns what happens next — starting
 *  it, exposing its DOM, bridging routes into it.
 *
 *  spec = {
 *      gclass,           // string, required — must be registered
 *      name,             // string, required — service name, unique per mount
 *      kw,               // object, optional — the view's kw
 *      transport,        // gobj | service name | omitted:
 *                        //   a gobj is used as-is (the caller already
 *                        //   resolved it — e.g. per connection), a string
 *                        //   is looked up with gobj_find_service(), and
 *                        //   omitted means "__remote_service__".
 *                        //   null DISABLES injection: for a hosted view
 *                        //   that takes its transport some other way.
 *      transport_attr    // string, optional — default "gobj_remote_yuno"
 *  }
 ************************************************************/
function yui_mount_service_view(host, spec)
{
    if(!host || !is_gobj(host) || !spec) {
        log_error(`${GCLASS_NAME}: yui_mount_service_view without host or spec`);
        return null;
    }

    const gclass = spec.gclass;
    const name   = spec.name;

    if(empty_string(gclass) || empty_string(name)) {
        log_error(
            `${gobj_short_name(host)}: mounting a service view needs gclass and name`
        );
        return null;
    }
    if(!gclass_find_by_name(gclass)) {
        log_error(`${gobj_short_name(host)}: gclass '${gclass}' is not registered`);
        return null;
    }

    let kw = Object.assign({}, spec.kw || {});

    /*  `undefined` means "the app's single transport"; an explicit null
     *  means "do not inject one".  They are NOT the same, hence the
     *  hasOwnProperty test instead of a truthiness check. */
    let transport = Object.prototype.hasOwnProperty.call(spec, "transport")
        ? spec.transport
        : DEFAULT_TRANSPORT_SERVICE;

    if(transport !== null) {
        if(is_string(transport)) {
            const service_name = transport;
            transport = gobj_find_service(service_name);
            if(!transport) {
                log_error(
                    `${gobj_short_name(host)}: transport service ` +
                    `'${service_name}' not found`
                );
                return null;
            }
        }
        if(!is_gobj(transport)) {
            log_error(`${gobj_short_name(host)}: transport is not a gobj`);
            return null;
        }
        kw[spec.transport_attr || DEFAULT_TRANSPORT_ATTR] = transport;
    }

    const view = gobj_create_service(name, gclass, kw, host);
    if(!view) {
        log_error(`${gobj_short_name(host)}: cannot create '${gclass}' as '${name}'`);
        return null;
    }
    return view;
}

/************************************************************
 *  The hosted view's $container, re-exposed as the host's — the
 *  shell/node mounts the HOST, so without this nothing is drawn.
 *  Never returns without setting one: an empty div beats a blank
 *  screen with the reason only in the console.
 ************************************************************/
function expose_view_container(host, view)
{
    let $c = view ? gobj_read_attr(view, "$container") : null;
    if(!$c) {
        log_error(
            `${gobj_short_name(host)}: hosted view does not expose $container ` +
            `— check its mt_create`
        );
        $c = createElement2(["div", {}, ""]);
    }
    gobj_write_attr(host, "$container", $c);
    return $c;
}




                    /***************************
                     *      Framework Methods
                     ***************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    let priv = gobj.priv;

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    priv.view = yui_mount_service_view(gobj, {
        gclass:         gobj_read_str_attr(gobj, "view_gclass"),
        name:           gobj_read_str_attr(gobj, "service_name"),
        kw:             gobj_read_attr(gobj, "view_kw") || {},
        transport:      gobj_read_str_attr(gobj, "transport_service"),
        transport_attr: gobj_read_str_attr(gobj, "transport_attr")
    });

    expose_view_container(gobj, priv.view);
}

/***************************************************************
 *          Framework Method: Start
 *
 *  The view starts HERE and not in mt_create, so its first
 *  request goes out when the host shows it.
 ***************************************************************/
function mt_start(gobj)
{
    const view = gobj.priv.view;
    if(view && !gobj_is_running(view)) {
        gobj_start(view);
    }
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    const view = gobj.priv.view;
    if(view && gobj_is_running(view)) {
        gobj_stop(view);
    }
}

/***************************************************************
 *          Framework Method: Destroy
 *
 *  The view is a SERVICE created with this gobj as its parent, so
 *  gobj_destroy cascades onto it — and deregisters its name.  Do
 *  NOT destroy it again here.
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

    priv.view = null;

    const $c = gobj_read_attr(gobj, "$container");
    if($c && $c.parentNode) {
        $c.parentNode.removeChild($c);
    }
    gobj_write_attr(gobj, "$container", null);
}




                    /***************************
                     *          FSM
                     ***************************/




const gmt = {
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy
};

function create_gclass(gclass_name)
{
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    const states = [
        ["ST_IDLE", []]
    ];

    const event_types = [];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,
        attrs_table,
        PRIVATE_DATA,
        0,
        0,
        0,
        0
    );

    return __gclass__ ? 0 : -1;
}

function register_c_yui_service_view()
{
    return create_gclass(GCLASS_NAME);
}

export {
    register_c_yui_service_view,
    yui_mount_service_view,
    expose_view_container,
};
