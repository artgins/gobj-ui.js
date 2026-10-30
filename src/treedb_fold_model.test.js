/***********************************************************************
 *          treedb_fold_model.test.js
 *
 *      The fold arithmetic of the treedb graph, pinned.
 *
 *      A small inventory on two axes: sites (a self-referent tree,
 *      where a thing is), owners (a self-referent tree of its own, who
 *      owns it), devices hanging from a site AND an owner, notes
 *      hanging from a site or a device, and a topic with hooks and no
 *      fkeys (extended) whose children must be roots.
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

const sites_desc = {
    topic_name: "sites",
    node_treedb_type: "entity",
    cols: [
        {id: "id", flag: []},
        {id: "site", flag: ["fkey"], fkey: {sites: "sites"}},
        {id: "sites", flag: ["hook"], hook: {sites: "site"}},
        {id: "devices", flag: ["hook"], hook: {devices: "site"}},
        {id: "notes", flag: ["hook"], hook: {notes: "site"}},
    ],
};
const devices_desc = {
    topic_name: "devices",
    node_treedb_type: "entity",
    cols: [
        {id: "id", flag: []},
        {id: "site", flag: ["fkey"], fkey: {sites: "devices"}},
        {id: "owner", flag: ["fkey"], fkey: {owners: "devices"}},
        {id: "photo", flag: ["fkey", "file"], fkey: {__assets__: "photos"}},
        {id: "notes", flag: ["hook"], hook: {notes: "device"}},
    ],
};
const notes_desc = {
    topic_name: "notes",
    node_treedb_type: "child",
    cols: [
        {id: "id", flag: []},
        {id: "site", flag: ["fkey"], fkey: {sites: "notes"}},
        {id: "device", flag: ["fkey"], fkey: {devices: "notes"}},
    ],
};
/*  owners inside owners: a second HIERARCHICAL topic, on an axis the
 *  sites know nothing of  */
const owners_desc = {
    topic_name: "owners",
    node_treedb_type: "entity",
    cols: [
        {id: "id", flag: []},
        {id: "parent", flag: ["fkey"], fkey: {owners: "owners"}},
        {id: "owners", flag: ["hook"], hook: {owners: "parent"}},
        {id: "devices", flag: ["hook"], hook: {devices: "owner"}},
    ],
};
const groups_desc = {
    topic_name: "groups",
    node_treedb_type: "extended",
    cols: [
        {id: "id", flag: []},
        {id: "members", flag: ["hook"], hook: {devices: "group"}},
    ],
};

const descs = {
    __graphs__: {topic_name: "__graphs__", cols: []},
    sites: sites_desc,
    devices: devices_desc,
    notes: notes_desc,
    owners: owners_desc,
    groups: groups_desc,
};

/*  region > (north, south); north > site1; site1 holds the devices and
 *  one note n1; the owner o1, a root of the owners tree, owns d0..d9.  */
function make_records(n_devices)
{
    let devices = [];
    for(let i = 0; i < n_devices; i++) {
        let rec = {id: `d${i}`, site: "sites^site1^devices", photo: "x^y^photos"};
        if(i < 10) {
            rec.owner = ["owners^o1^devices"];
        }
        devices.push(rec);
    }
    return {
        sites: [
            {id: "region", site: ""},
            {id: "north", site: "sites^region^sites"},
            {id: "south", site: "sites^region^sites"},
            {id: "site1", site: "sites^north^sites"},
        ],
        devices: devices,
        notes: [{id: "n1", site: "sites^site1^notes"}],
        owners: [{id: "o1", parent: ""}],
        groups: [{id: "g1"}],
    };
}

const K = (t, id) => `${t}^${id}`;

describe("the model", () => {
    test("every record is a node, system topics are skipped", () => {
        let m = fold_build_model(descs, make_records(3));
        expect(m.nodes.size).toBe(4 + 3 + 1 + 1 + 1);
        expect(m.topics).toEqual(["sites", "devices", "notes", "owners", "groups"]);
    });

    test("children hang from the hook the fkey names, in record order", () => {
        let m = fold_build_model(descs, make_records(3));
        expect(m.groups.get(fold_group_key(K("sites", "region"), "sites")))
            .toEqual([K("sites", "north"), K("sites", "south")]);
        expect(m.groups.get(fold_group_key(K("sites", "site1"), "devices")))
            .toEqual([K("devices", "d0"), K("devices", "d1"), K("devices", "d2")]);
        expect(m.groups.get(fold_group_key(K("owners", "o1"), "devices")))
            .toEqual([K("devices", "d0"), K("devices", "d1"), K("devices", "d2")]);
    });

    test("a device has two parents, of two topics, and is one node", () => {
        let m = fold_build_model(descs, make_records(3));
        let d0 = m.nodes.get(K("devices", "d0"));
        expect(d0.parents.map((p) => p.node_key).sort())
            .toEqual([K("owners", "o1"), K("sites", "site1")]);
    });

    test("roots: no drawable parent -- and a fkey into a topic nobody fetched is not a parent", () => {
        let m = fold_build_model(descs, make_records(3));
        expect(m.groups.get(fold_root_group_key("sites"))).toEqual([K("sites", "region")]);
        expect(m.groups.get(fold_root_group_key("devices"))).toBeUndefined();
        /*  `photo` names __assets__, which has no desc: ignored  */
        expect(m.nodes.get(K("devices", "d0")).parents.length).toBe(2);
        expect(m.groups.get(fold_root_group_key("groups"))).toEqual([K("groups", "g1")]);
        expect(m.groups.get(fold_root_group_key("owners"))).toEqual([K("owners", "o1")]);
    });

    test("a child of an `extended` parent only has no parent: the engine draws no edge to one", () => {
        let recs = make_records(1);
        recs.devices[0] = {id: "d0", group: "groups^g1^members"};
        let m = fold_build_model(descs, recs);
        expect(m.nodes.get(K("groups", "g1")).hooks).toEqual({});
        /*  devices hang from sites (the main topic), so a device with
         *  no parent is LOOSE, not a root -- see the "main topic" block  */
        expect(m.loose.devices).toEqual([K("devices", "d0")]);
        expect(m.groups.get(fold_root_group_key("devices"))).toBeUndefined();
        /*  and with no main topic it is a plain root  */
        let m2 = fold_build_model({sites: sites_desc, devices: devices_desc, groups: groups_desc}, recs, {main_topic: ""});
        expect(m2.main_topic).toBe("sites");   /*  "" means "deduce", and sites reaches devices  */
        let m3 = fold_build_model({devices: devices_desc, groups: groups_desc}, recs);
        expect(m3.main_topic).toBe("");
        expect(m3.groups.get(fold_root_group_key("devices"))).toEqual([K("devices", "d0")]);
    });

    test("a cycle with no way in gets one root, not a row of them", () => {
        let recs = {
            sites: [
                {id: "a", site: "sites^c^sites"},
                {id: "b", site: "sites^a^sites"},
                {id: "c", site: "sites^b^sites"},
            ],
        };
        let m = fold_build_model({sites: sites_desc}, recs);
        expect(m.groups.get(fold_root_group_key("sites"))).toEqual([K("sites", "a")]);
        let st = fold_new_state(24);
        fold_expand_all(m, st);
        expect(fold_visible_set(m, st).size).toBe(3);
    });

    test("group keys split back", () => {
        expect(fold_split_group_key("sites^site1|devices"))
            .toEqual({node_key: "sites^site1", hook: "devices"});
        expect(fold_split_group_key("|devices")).toEqual({node_key: "", hook: "devices"});
        expect(fold_split_group_key("nope")).toBeNull();
    });
});

describe("main topic, hidden topics, loose records", () => {
    test("the main topic is the one whose hooks reach the most others; sites, not groups", () => {
        expect(fold_main_topic(descs)).toBe("sites");
        let m = fold_build_model(descs, make_records(3));
        expect(m.main_topic).toBe("sites");
        expect([...m.linked].sort()).toEqual(["devices", "notes", "sites"]);
        /*  owners is a tree of its own: the sites reach none of it  */
        expect(m.linked.has("owners")).toBe(false);
        expect(m.linked.has("groups")).toBe(false);
    });

    test("only a topic hooked to ITSELF can be the main one", () => {
        expect(fold_is_hierarchical(descs, "sites")).toBe(true);
        expect(fold_is_hierarchical(descs, "owners")).toBe(true);
        expect(fold_is_hierarchical(descs, "devices")).toBe(false);
        expect(fold_is_hierarchical(descs, "notes")).toBe(false);
        expect(fold_is_hierarchical(descs, "groups")).toBe(false);
        /*  c reaches x and nothing reaches itself: no trunk at all  */
        let c = {topic_name: "c", cols: [{id: "id", flag: []},
                 {id: "xs", flag: ["hook"], hook: {x: "c"}}]};
        let x = {topic_name: "x", cols: [{id: "id", flag: []}, {id: "c", flag: ["fkey"]}]};
        expect(fold_main_topic({c: c, x: x})).toBe("");
        /*  a tree of sites alone, reaching no other topic, is still a trunk  */
        expect(fold_main_topic({sites: sites_desc})).toBe("sites");
    });

    test("the schema's mark wins over the deduction, among hierarchical topics", () => {
        /*  two hierarchical topics; sites reaches more (devices, notes)  */
        expect(fold_main_topic(descs)).toBe("sites");
        let marked = Object.assign({}, descs, {owners: Object.assign({}, owners_desc, {main_topic: true})});
        expect(fold_main_topic(marked)).toBe("owners");
        /*  a mark on a topic that is not hierarchical is not a trunk  */
        let wrong = Object.assign({}, descs, {devices: Object.assign({}, devices_desc, {main_topic: true})});
        expect(fold_main_topic(wrong)).toBe("sites");
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
        let m = fold_build_model(descs, make_records(3), {main_topic: "owners"});
        expect(m.main_topic).toBe("owners");
        expect([...m.linked].sort()).toEqual(["devices", "notes", "owners"]);
        /*  sites is not linked to owners, so its roots are roots  */
        expect(m.groups.get(fold_root_group_key("sites"))).toEqual([K("sites", "region")]);
        /*  a pick the rule refuses is ignored, and the trunk is deduced  */
        let m2 = fold_build_model(descs, make_records(3), {main_topic: "devices"});
        expect(m2.main_topic).toBe("sites");
    });

    test("a device with no site is LOOSE: counted, not a root, unless asked for", () => {
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

    test("a note on a loose device only is loose too, and follows it", () => {
        let recs = make_records(0);
        recs.devices.push({id: "d_loose"});
        recs.notes.push({id: "n_under", device: ["devices^d_loose^notes"]});
        let m = fold_build_model(descs, recs);
        expect(m.loose.devices).toEqual([K("devices", "d_loose")]);
        expect(m.loose.notes).toEqual([K("notes", "n_under")]);
        let st = fold_new_state(24);
        fold_expand_all(m, st);
        expect(fold_visible_set(m, st).has(K("notes", "n_under"))).toBe(false);
        let m2 = fold_build_model(descs, recs, {loose_topics: ["devices"]});
        fold_expand_all(m2, st);
        expect(fold_visible_set(m2, st).has(K("notes", "n_under"))).toBe(true);
    });

    test("a hidden topic leaves the model whole: no node, no pill, no edge", () => {
        let m = fold_build_model(descs, make_records(30), {hidden_topics: ["devices"]});
        expect(m.topics).toEqual(["sites", "notes", "owners", "groups"]);
        expect(m.totals.devices).toBe(30);
        expect(m.nodes.get(K("sites", "site1")).hooks.devices).toBeUndefined();
        expect(fold_pills_of(m, fold_new_state(24), K("sites", "site1")).map((p) => p.hook))
            .toEqual(["notes"]);
        expect(m.hidden.has("devices")).toBe(true);
    });

    test("hiding a topic in the middle: what hung from it alone becomes loose", () => {
        let m = fold_build_model(descs, make_records(12), {hidden_topics: ["owners"]});
        /*  d0..d9 hang from site1 AND o1: still under site1  */
        expect(m.nodes.get(K("devices", "d0")).parents.length).toBe(1);
        expect(m.loose.devices).toEqual([]);
        /*  sites hidden = the main topic gone: nothing governs, and
         *  whatever has no parent left is a root -- o1, with d0 and d1
         *  still hanging from it, and n1  */
        let m2 = fold_build_model(descs, make_records(2), {hidden_topics: ["sites"]});
        expect(m2.main_topic).toBe("");
        expect(m2.groups.get(fold_root_group_key("owners"))).toEqual([K("owners", "o1")]);
        expect(m2.groups.get(fold_root_group_key("notes"))).toEqual([K("notes", "n1")]);
        expect(m2.groups.get(fold_root_group_key("devices"))).toBeUndefined();
        let m3 = fold_build_model(descs, {devices: [{id: "d9"}]}, {hidden_topics: ["sites"]});
        expect(m3.groups.get(fold_root_group_key("devices"))).toEqual([K("devices", "d9")]);
    });

    test("a topic shown again opens on its roots' first page: nobody folds the roots", () => {
        let recs = make_records(3);
        let st = fold_new_state(24);
        let m = fold_build_model(descs, recs, {hidden_topics: ["groups"]});
        fold_expand_to_depth(m, st, 2);
        expect(fold_visible_set(m, st).has(K("groups", "g1"))).toBe(false);
        let m2 = fold_build_model(descs, recs);
        expect(fold_visible_set(m2, st).has(K("groups", "g1"))).toBe(true);
        expect(fold_pending_groups(m2, st, fold_visible_set(m2, st))).toEqual([]);
    });

    test("the fold state survives a hide and a show", () => {
        let recs = make_records(30);
        let st = fold_new_state(24);
        let m = fold_build_model(descs, recs);
        fold_expand_to_depth(m, st, 4);
        let g = fold_group_key(K("sites", "site1"), "devices");
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
            .toEqual([K("groups", "g1"), K("owners", "o1"), K("sites", "region")]);
    });

    test("depth 2 opens the roots' hooks on their first page", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 2);
        let v = fold_visible_set(m, st);
        expect(v.has(K("sites", "north"))).toBe(true);
        expect(v.has(K("sites", "south"))).toBe(true);
        expect(v.has(K("sites", "site1"))).toBe(false);
        expect(v.has(K("devices", "d15"))).toBe(false);
        /*  o1 is a root: its devices are one level down  */
        expect(v.has(K("devices", "d0"))).toBe(true);
    });

    test("depth 4 reaches the devices, one page of them", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        let v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d0"))).toBe(true);
        expect(v.has(K("devices", "d23"))).toBe(true);
        expect(v.has(K("devices", "d24"))).toBe(false);
        expect(v.has(K("notes", "n1"))).toBe(true);
    });

    test("expand all shows everything, collapse all the roots' first page", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_all(m, st);
        expect(fold_visible_set(m, st).size).toBe(m.nodes.size);
        fold_collapse_all(m, st);
        expect(fold_visible_set(m, st).size).toBe(3);
    });
});

describe("levels of the main tree (the toolbar's stepper)", () => {
    test("levels count from the main topic's roots, down every hook", () => {
        let recs = make_records(30);
        recs.notes.push({id: "n2", site: "sites^north^notes", device: ["devices^d0^notes"]});
        let m = fold_build_model(descs, recs);
        /*  region 1, north/south 2, site1 3, its devices and n1 4  */
        expect(m.levels).toBe(4);
        expect(m.level_of.get(K("sites", "region"))).toBe(1);
        expect(m.level_of.get(K("sites", "site1"))).toBe(3);
        expect(m.level_of.get(K("devices", "d0"))).toBe(4);
        /*  n2 hangs from north (2) and d0 (4): the shallowest wins  */
        expect(m.level_of.get(K("notes", "n2"))).toBe(3);
        /*  owners and groups are not tied to sites: trees of their own, no level  */
        expect(m.level_of.has(K("owners", "o1"))).toBe(false);
        expect(m.level_of.has(K("groups", "g1"))).toBe(false);
    });

    test("a hidden topic takes its levels with it", () => {
        let m = fold_build_model(descs, make_records(30), {hidden_topics: ["devices", "notes"]});
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
            .toEqual([K("groups", "g1"), K("owners", "o1"), K("sites", "region")]);
        fold_open_levels(m, st, 2);
        let v = fold_visible_set(m, st);
        expect(v.has(K("sites", "north"))).toBe(true);
        expect(v.has(K("sites", "site1"))).toBe(false);
        fold_open_levels(m, st, 3);
        expect(fold_visible_set(m, st).has(K("sites", "site1"))).toBe(true);
        expect(fold_visible_set(m, st).has(K("devices", "d0"))).toBe(false);
        fold_open_levels(m, st, 4);
        v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d23"))).toBe(true);
        expect(v.has(K("devices", "d24"))).toBe(false);  /*  one page  */
        expect(v.has(K("notes", "n1"))).toBe(true);
        /*  the owners tree has no level: the stepper leaves it to its pills  */
        expect(fold_is_open(st, fold_group_key(K("owners", "o1"), "devices"))).toBe(false);
    });

    test("opening keeps the pages already shown; closing folds only from its level down", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_level(m, st, 4);
        let g = fold_group_key(K("sites", "site1"), "devices");
        fold_show_more(m, st, g);                           /*  30  */
        fold_open_levels(m, st, 4);
        expect(fold_group_shown(m, st, g)).toBe(30);
        fold_close_levels(m, st, 3);
        let v = fold_visible_set(m, st);
        expect(v.has(K("sites", "site1"))).toBe(true);     /*  level 3 stays  */
        expect(v.has(K("devices", "d0"))).toBe(false);      /*  its hooks folded  */
        expect(v.has(K("notes", "n1"))).toBe(false);
        expect(fold_is_open(st, fold_group_key(K("sites", "north"), "sites"))).toBe(true);
    });

    test("closing does not reopen what the reader folded above the level", () => {
        let m = fold_build_model(descs, make_records(3));
        let st = fold_new_state(24);
        fold_expand_to_level(m, st, 4);
        fold_toggle(m, st, fold_group_key(K("sites", "region"), "sites"));   /*  fold region  */
        fold_close_levels(m, st, 3);
        expect(fold_is_open(st, fold_group_key(K("sites", "region"), "sites"))).toBe(false);
    });
});

describe("toggle and pages", () => {
    test("a folded group opens on its first page and closes again", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 3);
        let g = fold_group_key(K("sites", "site1"), "devices");
        expect(fold_toggle(m, st, g)).toBe(true);
        expect(fold_visible_set(m, st).has(K("devices", "d15"))).toBe(true);
        expect(fold_toggle(m, st, g)).toBe(false);
        expect(fold_visible_set(m, st).has(K("devices", "d15"))).toBe(false);
    });

    test("show more adds a page and stops at the total", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        let g = fold_group_key(K("sites", "site1"), "devices");
        expect(fold_show_more(m, st, g)).toBe(24);
        expect(fold_show_more(m, st, g)).toBe(30);
        expect(fold_show_more(m, st, g)).toBe(30);
    });

    test("a group open under a folded ancestor is remembered, not shown", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        fold_toggle(m, st, fold_group_key(K("sites", "region"), "sites"));   /* close */
        let v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d15"))).toBe(false);
        /*  the three roots, and o1's ten devices, which o1 still shows  */
        expect(v.size).toBe(3 + 10);
        fold_toggle(m, st, fold_group_key(K("sites", "region"), "sites"));   /* reopen */
        expect(fold_visible_set(m, st).has(K("devices", "d15"))).toBe(true);
    });

    test("the union: folding one parent leaves the child where the other shows it", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);                  /* site1's and o1's devices open */
        let g_site = fold_group_key(K("sites", "site1"), "devices");
        expect(fold_is_open(st, fold_group_key(K("owners", "o1"), "devices"))).toBe(true);
        fold_toggle(m, st, g_site);                      /* site1's devices folded */
        let v = fold_visible_set(m, st);
        expect(v.has(K("devices", "d3"))).toBe(true);     /* via o1 */
        expect(v.has(K("devices", "d15"))).toBe(false);   /* only via site1 */
    });

    test("pending groups: what the +N chips are for", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        let v = fold_visible_set(m, st);
        let pending = fold_pending_groups(m, st, v);
        expect(pending.length).toBe(1);
        expect(pending[0]).toMatchObject({
            group_key: fold_group_key(K("sites", "site1"), "devices"),
            node_key: K("sites", "site1"), hook: "devices",
            shown: 24, total: 30, rest: 6,
        });
    });

    test("pills of a card: one per hook with children, coloured by the child's topic", () => {
        let m = fold_build_model(descs, make_records(30));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        let pills = fold_pills_of(m, st, K("sites", "site1"));
        expect(pills.map((p) => p.hook)).toEqual(["devices", "notes"]);
        expect(pills[0]).toMatchObject({total: 30, shown: 24, open: true, child_topic: "devices"});
        expect(pills[1]).toMatchObject({total: 1, shown: 1, open: true, child_topic: "notes"});
        expect(fold_pills_of(m, st, K("sites", "south"))).toEqual([]);
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
        expect(v.has(K("sites", "south"))).toBe(true);    /* region|sites opened whole page */
    });

    test("does not close what was open", () => {
        let m = fold_build_model(descs, make_records(60));
        let st = fold_new_state(24);
        fold_expand_to_depth(m, st, 4);
        fold_show_more(m, st, fold_group_key(K("sites", "site1"), "devices"));   /* 48 */
        fold_reveal(m, st, K("devices", "d3"));
        expect(fold_visible_set(m, st).has(K("devices", "d47"))).toBe(true);
    });

    test("an unknown key is refused", () => {
        let m = fold_build_model(descs, make_records(3));
        let st = fold_new_state(24);
        expect(fold_reveal(m, st, K("devices", "nope"))).toBe(false);
    });
});
