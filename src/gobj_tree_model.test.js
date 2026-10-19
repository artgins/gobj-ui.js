import {describe, it, expect} from "vitest";
import {
    node_role,
    node_status,
    node_status_symbol,
    node_status_key,
    node_can_pause,
    node_badge_keys,
    node_info_rows,
    describe_backend_node,
    describe_backend_tree,
    trace_rows,
    own_trace_levels,
} from "./gobj_tree_model.js";

/*  A `view-gobj-tree` answer, trimmed to what the view reads.  */
const BACKEND_TREE = {
    "Yuno^my_yuno": {
        fullname: "Yuno^my_yuno",
        shortname: "Yuno^my_yuno",
        gclass: "C_YUNO",
        name: "my_yuno",
        parent: "",
        state: "ST_IDLE",
        running: true,
        playing: true,
        service: true,
        disabled: false,
        volatil: false,
        commands: true,
        gobj_flags: ["gobj_flag_yuno", "gobj_flag_service"],
        gobj_trace_level: ["machine"],
        children: {
            "C_TIMER^timer": {
                shortname: "C_TIMER^timer",
                gclass: "C_TIMER",
                name: "timer",
                parent: "Yuno^my_yuno",
                state: "ST_IDLE",
                running: true,
                playing: false,
                service: false,
                disabled: false,
                volatil: false,
                gobj_flags: ["gobj_flag_pure_child"],
            },
            "C_TCP^conn": {
                shortname: "C_TCP^conn",
                gclass: "C_TCP",
                name: "conn",
                state: "ST_STOPPED",
                running: false,
                playing: false,
                service: false,
                disabled: true,
                volatil: true,
                bottom_gobj: "C_TCP^raw",
                gobj_flags: ["gobj_flag_volatil"],
            },
        },
    },
};

describe("describe_backend_tree", () => {
    it("reads the root and its children out of the command answer", () => {
        let root = describe_backend_tree(BACKEND_TREE);
        expect(root.gclass).toBe("C_YUNO");
        expect(root.is_yuno).toBe(true);
        expect(root.children.length).toBe(2);
        expect(root.children.map(c => c.gclass).sort())
            .toEqual(["C_TCP", "C_TIMER"]);
    });

    it("a malformed answer is null, not an empty tree", () => {
        expect(describe_backend_tree(null)).toBe(null);
        expect(describe_backend_tree({})).toBe(null);
        expect(describe_backend_tree([])).toBe(null);
    });

    it("takes pure_child from gobj_flags, which has no boolean of its own", () => {
        let root = describe_backend_tree(BACKEND_TREE);
        let timer = root.children.find(c => c.gclass === "C_TIMER");
        expect(timer.pure_child).toBe(true);
        expect(timer.service).toBe(false);
    });

    it("a node with no children answers an empty list, not undefined", () => {
        let d = describe_backend_node("C_X^x", {gclass: "C_X"}, false);
        expect(d.children).toEqual([]);
    });
});

describe("node_role", () => {
    it("the yuno wins over every other mark", () => {
        expect(node_role({is_yuno: true, service: true, volatil: true}))
            .toBe("yuno");
    });

    it("orders service over volatil over pure", () => {
        expect(node_role({service: true, volatil: true})).toBe("service");
        expect(node_role({volatil: true, pure_child: true})).toBe("volatil");
        expect(node_role({pure_child: true})).toBe("pure");
        expect(node_role({})).toBe("child");
    });
});

describe("node_status", () => {
    it("tells the three states apart", () => {
        expect(node_status({running: false, playing: false})).toBe("stopped");
        expect(node_status({running: true, playing: false})).toBe("running");
        expect(node_status({running: true, playing: true})).toBe("playing");
    });

    it("says PAUSED for the one that runs and does not play", () => {
        expect(node_status_key({running: true, playing: false}))
            .toBe("running (paused)");
        expect(node_status_key({running: true, playing: true}))
            .toBe("playing");
    });

    it("a gobj that plays without running cannot happen, and reads stopped", () => {
        expect(node_status({running: false, playing: true})).toBe("stopped");
    });

    it("never says paused for a gobj with nothing to play", () => {
        let d = {running: true, playing: false, play_methods: false};
        expect(node_can_pause(d)).toBe(false);
        expect(node_status(d)).toBe("running");
        expect(node_status_key(d)).toBe("running");
        expect(node_status_symbol(d)).toBe("\u25CF");
        /*  Played anyway, it says so; stopped is stopped.  */
        expect(node_status_key({running: true, playing: true, play_methods: false}))
            .toBe("playing");
        expect(node_status_key({running: false, play_methods: false}))
            .toBe("stopped");
    });

    it("an unknown play_methods keeps the old word: paused", () => {
        expect(node_can_pause({running: true, play_methods: null})).toBe(true);
        expect(node_can_pause({running: true})).toBe(true);
        expect(node_status_key({running: true, playing: false, play_methods: true}))
            .toBe("running (paused)");
    });
});

describe("node_badge_keys", () => {
    it("marks the role and every extra fact, in a fixed order", () => {
        let root = describe_backend_tree(BACKEND_TREE);
        expect(node_badge_keys(root)).toEqual(["yuno", "commands", "traces"]);

        let tcp = root.children.find(c => c.gclass === "C_TCP");
        expect(node_badge_keys(tcp))
            .toEqual(["volatil child", "disabled", "bottom"]);
    });

    it("a plain child carries no role badge", () => {
        expect(node_badge_keys({})).toEqual([]);
    });

    it("a gobj that traces says so, last", () => {
        expect(node_badge_keys({gobj_trace_level: ["machine"]})).toEqual(["traces"]);
        expect(node_badge_keys({gobj_trace_level: []})).toEqual([]);
    });
});

describe("trace_rows", () => {
    const INFO = {
        gclass_levels: {traffic: "dump", connections: "connections"},
        global_levels: {machine: "machine", connections: "never listed twice"},
        gclass_on: ["connections", "machine"],     /*  OR'ed with the global ones  */
        global_on: ["machine"],
    };
    const by_level = (rows) => {
        let map = {};
        for(let r of rows) {
            map[r.level] = r;
        }
        return map;
    };

    it("lists the gclass levels first, then the global ones, each once", () => {
        let rows = trace_rows({gobj_trace_level: []}, INFO);
        expect(rows.map((r) => [r.level, r.group])).toEqual([
            ["traffic", "gclass"], ["connections", "gclass"], ["machine", "global"]
        ]);
    });

    it("locks a level held by a wider scope, and says which", () => {
        let r = by_level(trace_rows({gobj_trace_level: ["traffic", "connections", "machine"]}, INFO));
        expect(r.traffic).toMatchObject({gobj_on: true, gobj_locked: false,
            gclass_on: false, gclass_locked: false, origin: ""});
        expect(r.connections).toMatchObject({gobj_on: true, gobj_locked: true,
            gclass_on: true, gclass_locked: false, origin: "gclass"});
        expect(r.machine).toMatchObject({gobj_on: true, gobj_locked: true,
            gclass_on: true, gclass_locked: true, origin: "global"});
    });

    it("what each scope holds on its own is what its remove turns off", () => {
        let rows = trace_rows({gobj_trace_level: ["traffic", "connections", "machine"]}, INFO);
        expect(own_trace_levels(rows, "gobj")).toEqual(["traffic"]);
        expect(own_trace_levels(rows, "gclass")).toEqual(["connections"]);
    });

    it("no info, no rows", () => {
        expect(trace_rows({gobj_trace_level: ["machine"]}, null)).toEqual([]);
        expect(own_trace_levels(null, "gobj")).toEqual([]);
    });
});

describe("node_info_rows", () => {
    const rows_of = (d) => {
        let map = {};
        for(let [label, value] of node_info_rows(d, null)) {
            map[label] = value;
        }
        return map;
    };

    it("names the role and the status with the reader's words", () => {
        let root = describe_backend_tree(BACKEND_TREE);
        let timer = root.children.find(c => c.gclass === "C_TIMER");
        let r = rows_of(timer);
        expect(r["role"]).toBe("pure child");
        /*  The symbol travels with the word: the popover is where a
         *  reader learns which glyph means what.  */
        expect(r["status"]).toBe("\u2016 running (paused)");
        expect(r["fsm state"]).toBe("ST_IDLE");
    });

    it("shows the facts a card has no room for", () => {
        let root = describe_backend_tree(BACKEND_TREE);
        let tcp = root.children.find(c => c.gclass === "C_TCP");
        let r = rows_of(tcp);
        expect(r["disabled"]).toBe("yes");
        expect(r["bottom gobj"]).toBe("C_TCP^raw");
        expect(r["status"]).toBe("\u2298 stopped");
    });

    it("carries the traces and the flags the backend reports", () => {
        let r = rows_of(describe_backend_tree(BACKEND_TREE));
        expect(r["traces"]).toBe("machine");
        expect(r["flags"]).toBe("gobj_flag_yuno, gobj_flag_service");
    });

    it("reads play_methods from the backend only when it answers a boolean", () => {
        expect(describe_backend_node("C_X^x", {play_methods: false}, false).play_methods)
            .toBe(false);
        expect(describe_backend_node("C_X^x", {play_methods: true}, false).play_methods)
            .toBe(true);
        expect(describe_backend_node("C_X^x", {}, false).play_methods).toBe(null);
        expect(describe_backend_node("C_X^x", {play_methods: 1}, false).play_methods)
            .toBe(null);
        let r = rows_of(describe_backend_node("C_TCP^x",
            {gclass: "C_TCP", running: true, playing: false, play_methods: false}, false));
        expect(r["status"]).toBe("\u25CF running");
    });

    it("omits every row whose fact is absent", () => {
        let r = rows_of(describe_backend_node("C_X^x", {gclass: "C_X"}, false));
        expect(r["bottom gobj"]).toBeUndefined();
        expect(r["traces"]).toBeUndefined();
        expect(r["disabled"]).toBeUndefined();
        expect(r["children"]).toBeUndefined();
    });

    it("says how many children are hidden when the node is folded", () => {
        let root = describe_backend_tree(BACKEND_TREE);
        expect(rows_of(root)["children"]).toBe("2");
        root.is_collapsed = true;
        expect(rows_of(root)["children"]).toBe("2 (collapsed)");
    });
});

describe("node_status_symbol", () => {
    it("gives each status its own SHAPE, not only a colour", () => {
        expect(node_status_symbol({running: true, playing: true})).toBe("\u25B6\uFE0E");
        expect(node_status_symbol({running: true, playing: false})).toBe("\u2016");
        expect(node_status_symbol({running: false})).toBe("\u25A0\uFE0E");
    });

    it("says disabled over anything else", () => {
        expect(node_status_symbol({running: true, playing: true, disabled: true}))
            .toBe("\u2298");
    });

    it("falls back to stopped for nothing at all", () => {
        expect(node_status_symbol(null)).toBe("\u25A0\uFE0E");
        expect(node_status_symbol(undefined)).toBe("\u25A0\uFE0E");
    });
});
