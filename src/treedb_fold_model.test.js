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
    fold_main_topic,
    fold_group_shown,
    fold_is_open,
    fold_level_clamp,
    fold_open_levels,
    fold_close_levels,
    fold_expand_to_level,
    fold_is_hierarchical,
} from "./treedb_fold_model.js";

const places_desc = {
    topic_name: "places",
    node_treedb_type: "entity",
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
    node_treedb_type: "entity",
    cols: [
        {id: "id", flag: []},
        {id: "place", flag: ["fkey"], fkey: {places: "controllers"}},
        {id: "devices", flag: ["hook"], hook: {devices: "controller"}},
    ],
};
/*  controllers inside controllers: a second HIERARCHICAL topic  */
const controllers_self = Object.assign({}, controllers_desc, {
    cols: controllers_desc.cols.concat([
        {id: "controllers", flag: ["hook"], hook: {controllers: "parent"}},
        {id: "parent", flag: ["fkey"], fkey: {controllers: "controllers"}},
    ]),
});
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

    test("a child of an `extended` parent only has no parent: the engine draws no edge to one", () => {
        let recs = make_records(1);
        recs.devices[0] = {id: "d0", group: "device_groups^g1^members"};
        let m = fold_build_model(descs, recs);
        expect(m.nodes.get(K("device_groups", "g1")).hooks).toEqual({});
        /*  devices hang from places (the main topic), so a device with
         *  no parent is LOOSE, not a root -- see the "main topic" block  */
        expect(m.loose.devices).toEqual([K("devices", "d0")]);
        expect(m.groups.get(fold_root_group_key("devices"))).toBeUndefined();
        /*  and with no main topic it is a plain root  */
        let m2 = fold_build_model({places: places_desc, devices: devices_desc, device_groups: groups_desc}, recs, {main_topic: ""});
        expect(m2.main_topic).toBe("places");   /*  "" means "deduce", and places reaches devices  */
        let m3 = fold_build_model({devices: devices_desc, device_groups: groups_desc}, recs);
        expect(m3.main_topic).toBe("");
        expect(m3.groups.get(fold_root_group_key("devices"))).toEqual([K("devices", "d0")]);
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

describe("main topic, hidden topics, loose records", () => {
    test("the main topic is the one whose hooks reach the most others; places, not device_groups", () => {
        expect(fold_main_topic(descs)).toBe("places");
        let m = fold_build_model(descs, make_records(3));
        expect(m.main_topic).toBe("places");
        expect([...m.linked].sort()).toEqual(["controllers", "devices", "places"]);
        expect(m.linked.has("device_groups")).toBe(false);
    });

    test("only a topic hooked to ITSELF can be the main one", () => {
        expect(fold_is_hierarchical(descs, "places")).toBe(true);
        expect(fold_is_hierarchical(descs, "controllers")).toBe(false);
        expect(fold_is_hierarchical(descs, "device_groups")).toBe(false);
        /*  c reaches x and nothing reaches itself: no trunk at all  */
        let c = {topic_name: "c", cols: [{id: "id", flag: []},
                 {id: "xs", flag: ["hook"], hook: {x: "c"}}]};
        let x = {topic_name: "x", cols: [{id: "id", flag: []}, {id: "c", flag: ["fkey"]}]};
        expect(fold_main_topic({c: c, x: x})).toBe("");
        /*  a tree of places alone, reaching no other topic, is still a trunk  */
        expect(fold_main_topic({places: places_desc})).toBe("places");
    });

    test("the schema's mark wins over the deduction, among hierarchical topics", () => {
        let d = Object.assign({}, descs, {controllers: controllers_self});
        expect(fold_main_topic(d)).toBe("places");  /*  places reaches more  */
        let marked = Object.assign({}, d, {controllers: Object.assign({}, controllers_self, {main_topic: true})});
        expect(fold_main_topic(marked)).toBe("controllers");
        /*  a mark on a topic that is not hierarchical is not a trunk  */
        let wrong = Object.assign({}, descs, {devices: Object.assign({}, devices_desc, {main_topic: true})});
        expect(fold_main_topic(wrong)).toBe("places");
    });

    test("a self-referent hook breaks a tie", () => {
        let a = {topic_name: "a", node_treedb_type: "extended",
                 cols: [{id: "id", flag: []}, {id: "xs", flag: ["hook"], hook: {x: "a"}}]};
        let b = {topic_name: "b", node_treedb_type: "entity",
                 cols: [{id: "id", flag: []}, {id: "xs", flag: ["hook"], hook: {x: "b"}},
                        {id: "bs", flag: ["hook"], hook: {b: "parent"}},
                        {id: "parent", flag: ["fkey"], fkey: {b: "bs"}}]};
        let x = {topic_name: "x", node_treedb_type: "child", cols: [{id: "id", flag: []}]};
        expect(fold_main_topic({a: a, b: b, x: x})).toBe("b");
        expect(fold_main_topic({x: x})).toBe("");
    });

    test("the reader's pick wins -- if it is a hierarchical topic", () => {
        let d = Object.assign({}, descs, {controllers: controllers_self});
        let m = fold_build_model(d, make_records(3), {main_topic: "controllers"});
        expect(m.main_topic).toBe("controllers");
        expect([...m.linked].sort()).toEqual(["controllers", "devices"]);
        /*  places is not linked to controllers, so its roots are roots  */
        expect(m.groups.get(fold_root_group_key("places"))).toEqual([K("places", "es")]);
        /*  a pick the rule refuses is ignored, and the trunk is deduced  */
        let m2 = fold_build_model(descs, make_records(3), {main_topic: "controllers"});
        expect(m2.main_topic).toBe("places");
    });

    test("a device with no place is LOOSE: counted, not a root, unless asked for", () => {
        let recs = make_records(3);
        recs.devices.push({id: "d_loose"});
        let m = fold_build_model(descs, recs);
        expect(m.loose.devices).toEqual([K("devices", "d_loose")]);
        expect(m.groups.get(fold_root_group_key("devices"))).toBeUndefined();
        expect(m.totals.devices).toBe(4);
        let m2 = fold_build_model(descs, recs, {loose_topics: ["devices"]});
        expect(m2.groups.get(fold_root_group_key("devices"))).toEqual([K("devices", "d_loose")]);
        expect(m2.loose.devices).toEqual([K("devices", "d_loose")]);
    });

    test("a device hanging from a loose controller only is loose too, and follows it", () => {
        let recs = make_records(0);
        recs.controllers.push({id: "c_loose"});
        recs.devices.push({id: "d_under", controller: ["controllers^c_loose^devices"]});
        let m = fold_build_model(descs, recs);
        expect(m.loose.controllers).toEqual([K("controllers", "c_loose")]);
        expect(m.loose.devices).toEqual([K("devices", "d_under")]);
        let st = fold_new_state(24);
        fold_expand_all(m, st);
        expect(fold_visible_set(m, st).has(K("devices", "d_under"))).toBe(false);
        let m2 = fold_build_model(descs, recs, {loose_topics: ["controllers"]});
        fold_expand_all(m2, st);
        expect(fold_visible_set(m2, st).has(K("devices", "d_under"))).toBe(true);
    });

    test("a hidden topic leaves the model whole: no node, no pill, no edge", () => {
        let m = fold_build_model(descs, make_records(30), {hidden_topics: ["devices"]});
        expect(m.topics).toEqual(["places", "controllers", "device_groups"]);
        expect(m.totals.devices).toBe(30);
        expect(m.nodes.get(K("places", "nave1")).hooks.devices).toBeUndefined();
        expect(fold_pills_of(m, fold_new_state(24), K("places", "nave1")).map((p) => p.hook))
            .toEqual(["controllers"]);
        expect(m.hidden.has("devices")).toBe(true);
    });

    test("hiding a topic in the middle: what hung from it alone becomes loose", () => {
        let m = fold_build_model(descs, make_records(12), {hidden_topics: ["controllers"]});
        /*  d0..d9 hang from nave1 AND c1: still under nave1  */
        expect(m.nodes.get(K("devices", "d0")).parents.length).toBe(1);
        expect(m.loose.devices).toEqual([]);
        /*  places hidden = the main topic gone: nothing governs, and
         *  whatever has no parent left is a root -- c1, with d0 and d1
         *  still hanging from it  */
        let m2 = fold_build_model(descs, make_records(2), {hidden_topics: ["places"]});
        expect(m2.main_topic).toBe("");
        expect(m2.groups.get(fold_root_group_key("controllers"))).toEqual([K("controllers", "c1")]);
        expect(m2.groups.get(fold_root_group_key("devices"))).toBeUndefined();
        let m3 = fold_build_model(descs, {devices: [{id: "d9"}]}, {hidden_topics: ["places"]});
        expect(m3.groups.get(fold_root_group_key("devices"))).toEqual([K("devices", "d9")]);
    });

    test("a topic shown again opens on its roots' first page: nobody folds the roots", () => {
        let recs = make_records(3);
        let st = fold_new_state(24);
        let m = fold_build_model(descs, recs, {hidden_topics: ["device_groups"]});
        fold_expand_to_depth(m, st, 2);
        expect(fold_visible_set(m, st).has(K("device_groups", "g1"))).toBe(false);
        let m2 = fold_build_model(descs, recs);
        expect(fold_visible_set(m2, st).has(K("device_groups", "g1"))).toBe(true);
        expect(fold_pending_groups(m2, st, fold_visible_set(m2, st))).toEqual([]);
    });

    test("the fold state survives a hide and a show", () => {
        let recs = make_records(30);
        let st = fold_new_state(24);
        let m = fold_build_model(descs, recs);
        fold_expand_to_depth(m, st, 4);
        let g = fold_group_key(K("places", "nave1"), "devices");
        expect(fold_group_shown(m, st, g)).toBe(24);
        let m_hidden = fold_build_model(descs, recs, {hidden_topics: ["devices"]});
        expect(fold_group_shown(m_hidden, st, g)).toBe(0);      /*  no group: nothing shown  */
        let m_back = fold_build_model(descs, recs);
        expect(fold_group_shown(m_back, st, g)).toBe(24);       /*  remembered  */
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

describe("levels of the main tree (the toolbar's stepper)", () => {
    test("levels count from the main topic's roots, down every hook", () => {
        let m = fold_build_model(descs, make_records(30));
        /*  es 1, norte/sur 2, nave1 3, its devices and c1 4  */
        expect(m.levels).toBe(4);
        expect(m.level_of.get(K("places", "es"))).toBe(1);
        expect(m.level_of.get(K("places", "nave1"))).toBe(3);
        /*  d0 hangs from nave1 (3) and c1 (4): the shallowest wins  */
        expect(m.level_of.get(K("devices", "d0"))).toBe(4);
        /*  device_groups is not tied to places: a tree of its own, no level  */
        expect(m.level_of.has(K("device_groups", "g1"))).toBe(false);
    });

    test("a hidden topic takes its levels with it", () => {
        let m = fold_build_model(descs, make_records(30), {hidden_topics: ["devices", "controllers"]});
        expect(m.levels).toBe(3);
        let m0 = fold_build_model({}, {});
        expect(m0.levels).toBe(0);
        expect(fold_level_clamp(m0, 5)).toBe(1);
    });

    test("clamp keeps a level between 1 and the deepest one", () => {
        let m = fold_build_model(descs, make_records(3));
        expect(fold_level_clamp(m, 0)).toBe(1);
        expect(fold_level_clamp(m, 3)).toBe(3);
        expect(fold_level_clamp(m, 9)).toBe(4);
        expect(fold_level_clamp(m, "2")).toBe(2);
    });

    test("level 1 is the roots of every tree, and each step opens one more", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_level(m, st, 1);
        expect([...fold_visible_set(m, st)].sort())
            .toEqual([K("device_groups", "g1"), K("places", "es")]);
        fold_open_levels(m, st, 2);
        let v = fold_visible_set(m, st);
        expect(v.has(K("places", "norte"))).toBe(true);
        expect(v.has(K("places", "nave1"))).toBe(false);
        fold_open_levels(m, st, 3);
        expect(fold_visible_set(m, st).has(K("places", "nave1"))).toBe(true);
        expect(fold_visible_set(m, st).has(K("devices", "d0"))).toBe(false);
        fold_open_levels(m, st, 4);
        v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d23"))).toBe(true);
        expect(v.has(K("devices", "d24"))).toBe(false);  /*  one page  */
        expect(v.has(K("controllers", "c1"))).toBe(true);
    });

    test("opening keeps the pages already shown; closing folds only from its level down", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_level(m, st, 4);
        let g = fold_group_key(K("places", "nave1"), "devices");
        fold_show_more(m, st, g);                           /*  30  */
        fold_open_levels(m, st, 4);
        expect(fold_group_shown(m, st, g)).toBe(30);
        fold_close_levels(m, st, 3);
        let v = fold_visible_set(m, st);
        expect(v.has(K("places", "nave1"))).toBe(true);     /*  level 3 stays  */
        expect(v.has(K("devices", "d0"))).toBe(false);      /*  its hooks folded  */
        expect(v.has(K("controllers", "c1"))).toBe(false);
        expect(fold_is_open(st, fold_group_key(K("places", "norte"), "places"))).toBe(true);
    });

    test("closing does not reopen what the reader folded above the level", () => {
        let m = fold_build_model(descs, make_records(3));
        let st = fold_new_state(24);
        fold_expand_to_level(m, st, 4);
        fold_toggle(m, st, fold_group_key(K("places", "es"), "places"));   /*  fold es  */
        fold_close_levels(m, st, 3);
        expect(fold_is_open(st, fold_group_key(K("places", "es"), "places"))).toBe(false);
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
