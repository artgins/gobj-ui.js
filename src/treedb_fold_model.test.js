/***********************************************************************
 *          treedb_fold_model.test.js
 *
 *      The fold arithmetic of the treedb graph, pinned.
 *
 *      A small treedb in the shape of the real one that forced this:
 *      places (a self-referent tree), devices hanging from a place AND
 *      a controller, controllers hanging from a place, and a topic with
 *      hooks and no fkeys (extended) whose children must be roots.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import {
    fold_build_model,
    fold_new_state,
    fold_visible_set,
    fold_expand_to_depth,
    fold_expand_all,
    fold_collapse_all,
    fold_toggle,
    fold_show_more,
    fold_reveal,
    fold_pills_of,
    fold_pending_groups,
    fold_group_key,
    fold_root_group_key,
    fold_split_group_key,
} from "./treedb_fold_model.js";

const places_desc = {
    topic_name: "places",
    node_treedb_type: "hierarchical",
    cols: [
        {id: "id", flag: []},
        {id: "place", flag: ["fkey"], fkey: {places: "places"}},
        {id: "places", flag: ["hook"], hook: {places: "place"}},
        {id: "devices", flag: ["hook"], hook: {devices: "place"}},
        {id: "controllers", flag: ["hook"], hook: {controllers: "place"}},
    ],
};
const devices_desc = {
    topic_name: "devices",
    node_treedb_type: "child",
    cols: [
        {id: "id", flag: []},
        {id: "place", flag: ["fkey"], fkey: {places: "devices"}},
        {id: "controller", flag: ["fkey"], fkey: {controllers: "devices"}},
        {id: "foto", flag: ["fkey", "file"], fkey: {__assets__: "fotos"}},
    ],
};
const controllers_desc = {
    topic_name: "controllers",
    node_treedb_type: "hierarchical",
    cols: [
        {id: "id", flag: []},
        {id: "place", flag: ["fkey"], fkey: {places: "controllers"}},
        {id: "devices", flag: ["hook"], hook: {devices: "controller"}},
    ],
};
const groups_desc = {
    topic_name: "device_groups",
    node_treedb_type: "extended",
    cols: [
        {id: "id", flag: []},
        {id: "members", flag: ["hook"], hook: {devices: "group"}},
    ],
};

const descs = {
    __graphs__: {topic_name: "__graphs__", cols: []},
    places: places_desc,
    devices: devices_desc,
    controllers: controllers_desc,
    device_groups: groups_desc,
};

/*  es > (norte, sur); norte > nave1; nave1 has 30 devices and one
 *  controller c1 that also reaches devices d0..d9.  */
function make_records(n_devices)
{
    let devices = [];
    for(let i = 0; i < n_devices; i++) {
        let rec = {id: `d${i}`, place: "places^nave1^devices", foto: "x^y^fotos"};
        if(i < 10) {
            rec.controller = ["controllers^c1^devices"];
        }
        devices.push(rec);
    }
    return {
        places: [
            {id: "es", place: ""},
            {id: "norte", place: "places^es^places"},
            {id: "sur", place: "places^es^places"},
            {id: "nave1", place: "places^norte^places"},
        ],
        devices: devices,
        controllers: [{id: "c1", place: "places^nave1^controllers"}],
        device_groups: [{id: "g1"}],
    };
}

const K = (t, id) => `${t}^${id}`;

describe("the model", () => {
    test("every record is a node, system topics are skipped", () => {
        let m = fold_build_model(descs, make_records(3));
        expect(m.nodes.size).toBe(4 + 3 + 1 + 1);
        expect(m.topics).toEqual(["places", "devices", "controllers", "device_groups"]);
    });

    test("children hang from the hook the fkey names, in record order", () => {
        let m = fold_build_model(descs, make_records(3));
        expect(m.groups.get(fold_group_key(K("places", "es"), "places")))
            .toEqual([K("places", "norte"), K("places", "sur")]);
        expect(m.groups.get(fold_group_key(K("places", "nave1"), "devices")))
            .toEqual([K("devices", "d0"), K("devices", "d1"), K("devices", "d2")]);
        expect(m.groups.get(fold_group_key(K("controllers", "c1"), "devices")))
            .toEqual([K("devices", "d0"), K("devices", "d1"), K("devices", "d2")]);
    });

    test("a device has two parents and is one node", () => {
        let m = fold_build_model(descs, make_records(3));
        let d0 = m.nodes.get(K("devices", "d0"));
        expect(d0.parents.map((p) => p.node_key).sort())
            .toEqual([K("controllers", "c1"), K("places", "nave1")]);
    });

    test("roots: no drawable parent -- and a fkey into a topic nobody fetched is not a parent", () => {
        let m = fold_build_model(descs, make_records(3));
        expect(m.groups.get(fold_root_group_key("places"))).toEqual([K("places", "es")]);
        expect(m.groups.get(fold_root_group_key("devices"))).toBeUndefined();
        /*  `foto` names __assets__, which has no desc: ignored  */
        expect(m.nodes.get(K("devices", "d0")).parents.length).toBe(2);
        expect(m.groups.get(fold_root_group_key("device_groups"))).toEqual([K("device_groups", "g1")]);
    });

    test("a child of an `extended` parent only is a root: the engine draws no edge to one", () => {
        let recs = make_records(1);
        recs.devices[0] = {id: "d0", group: "device_groups^g1^members"};
        let m = fold_build_model(descs, recs);
        expect(m.groups.get(fold_root_group_key("devices"))).toEqual([K("devices", "d0")]);
        expect(m.nodes.get(K("device_groups", "g1")).hooks).toEqual({});
    });

    test("a cycle with no way in gets one root, not a row of them", () => {
        let recs = {
            places: [
                {id: "a", place: "places^c^places"},
                {id: "b", place: "places^a^places"},
                {id: "c", place: "places^b^places"},
            ],
        };
        let m = fold_build_model({places: places_desc}, recs);
        expect(m.groups.get(fold_root_group_key("places"))).toEqual([K("places", "a")]);
        let st = fold_new_state(24);
        fold_expand_all(m, st);
        expect(fold_visible_set(m, st).size).toBe(3);
    });

    test("group keys split back", () => {
        expect(fold_split_group_key("places^nave1|devices"))
            .toEqual({node_key: "places^nave1", hook: "devices"});
        expect(fold_split_group_key("|devices")).toEqual({node_key: "", hook: "devices"});
        expect(fold_split_group_key("nope")).toBeNull();
    });
});

describe("depth", () => {
    test("depth 1 is the roots alone", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 1);
        expect([...fold_visible_set(m, st)].sort())
            .toEqual([K("device_groups", "g1"), K("places", "es")]);
    });

    test("depth 2 opens the roots' hooks on their first page", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 2);
        let v = fold_visible_set(m, st);
        expect(v.has(K("places", "norte"))).toBe(true);
        expect(v.has(K("places", "sur"))).toBe(true);
        expect(v.has(K("places", "nave1"))).toBe(false);
        expect(v.has(K("devices", "d0"))).toBe(false);
    });

    test("depth 4 reaches the devices, one page of them", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        let v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d0"))).toBe(true);
        expect(v.has(K("devices", "d23"))).toBe(true);
        expect(v.has(K("devices", "d24"))).toBe(false);
        expect(v.has(K("controllers", "c1"))).toBe(true);
    });

    test("expand all shows everything, collapse all the roots' first page", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_all(m, st);
        expect(fold_visible_set(m, st).size).toBe(m.nodes.size);
        fold_collapse_all(m, st);
        expect(fold_visible_set(m, st).size).toBe(2);
    });
});

describe("toggle and pages", () => {
    test("a folded group opens on its first page and closes again", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 3);
        let g = fold_group_key(K("places", "nave1"), "devices");
        expect(fold_toggle(m, st, g)).toBe(true);
        expect(fold_visible_set(m, st).has(K("devices", "d5"))).toBe(true);
        expect(fold_toggle(m, st, g)).toBe(false);
        expect(fold_visible_set(m, st).has(K("devices", "d5"))).toBe(false);
    });

    test("show more adds a page and stops at the total", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        let g = fold_group_key(K("places", "nave1"), "devices");
        expect(fold_show_more(m, st, g)).toBe(24);
        expect(fold_show_more(m, st, g)).toBe(30);
        expect(fold_show_more(m, st, g)).toBe(30);
    });

    test("a group open under a folded ancestor is remembered, not shown", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        fold_toggle(m, st, fold_group_key(K("places", "es"), "places"));   /* close */
        let v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d0"))).toBe(false);
        expect(v.size).toBe(2);
        fold_toggle(m, st, fold_group_key(K("places", "es"), "places"));   /* reopen */
        expect(fold_visible_set(m, st).has(K("devices", "d0"))).toBe(true);
    });

    test("the union: folding one parent leaves the child where the other shows it", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        let g_place = fold_group_key(K("places", "nave1"), "devices");
        let g_ctrl = fold_group_key(K("controllers", "c1"), "devices");
        fold_toggle(m, st, g_ctrl);                       /* c1's devices open too */
        fold_toggle(m, st, g_place);                      /* nave1's devices folded */
        let v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d3"))).toBe(true);     /* via c1 */
        expect(v.has(K("devices", "d15"))).toBe(false);   /* only via nave1 */
    });

    test("pending groups: what the +N chips are for", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        let v = fold_visible_set(m, st);
        let pending = fold_pending_groups(m, st, v);
        expect(pending.length).toBe(1);
        expect(pending[0]).toMatchObject({
            group_key: fold_group_key(K("places", "nave1"), "devices"),
            node_key: K("places", "nave1"), hook: "devices",
            shown: 24, total: 30, rest: 6,
        });
    });

    test("pills of a card: one per hook with children, coloured by the child's topic", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        let pills = fold_pills_of(m, st, K("places", "nave1"));
        expect(pills.map((p) => p.hook)).toEqual(["devices", "controllers"]);
        expect(pills[0]).toMatchObject({total: 30, shown: 24, open: true, child_topic: "devices"});
        expect(pills[1]).toMatchObject({total: 1, shown: 1, open: true, child_topic: "controllers"});
        expect(fold_pills_of(m, st, K("places", "sur"))).toEqual([]);
    });
});

describe("reveal", () => {
    test("opens the path down to a hidden node, one page boundary at a time", () => {
        let m = fold_build_model(descs, make_records(60));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 1);
        expect(fold_reveal(m, st, K("devices", "d40"))).toBe(true);
        let v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d40"))).toBe(true);
        /*  d40 is the 41st: two pages, not three, and not all  */
        expect(v.has(K("devices", "d47"))).toBe(true);
        expect(v.has(K("devices", "d48"))).toBe(false);
        expect(v.has(K("places", "sur"))).toBe(true);    /* es|places opened whole page */
    });

    test("does not close what was open", () => {
        let m = fold_build_model(descs, make_records(60));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        fold_show_more(m, st, fold_group_key(K("places", "nave1"), "devices"));   /* 48 */
        fold_reveal(m, st, K("devices", "d3"));
        expect(fold_visible_set(m, st).has(K("devices", "d47"))).toBe(true);
    });

    test("an unknown key is refused", () => {
        let m = fold_build_model(descs, make_records(3));
        let st = fold_new_state(24);
        expect(fold_reveal(m, st, K("devices", "nope"))).toBe(false);
    });
});
