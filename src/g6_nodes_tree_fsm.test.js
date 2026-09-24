/***********************************************************************
 *          g6_nodes_tree_fsm.test.js
 *
 *      The machine of the real C_G6_NODES_TREE: the events its host
 *      sends it are declared, and each has an action. The host's own
 *      tests drive a fake engine, which cannot see this.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    gclass_find_by_name, gclass_event_type, gclass_check_fsm,
} = await import("@yuneta/gobj-js");
const {register_c_g6_nodes_tree} = await import("./c_g6_nodes_tree.js");

describe("C_G6_NODES_TREE", () => {

    test("hears EV_GRAPHS_WRITE_REFUSED, the host's word on a __graphs__ write", () => {
        register_c_g6_nodes_tree();
        const gclass = gclass_find_by_name("C_G6_NODES_TREE", false);
        expect(gclass).toBeTruthy();
        expect(gclass_event_type(gclass, "EV_GRAPHS_WRITE_REFUSED")).toBeTruthy();
        const idle = gclass.dl_states.find((st) => st.state_name === "ST_IDLE");
        expect(idle.dl_actions.some((a) => a.event_name === "EV_GRAPHS_WRITE_REFUSED" &&
            typeof a.action === "function")).toBe(true);
        expect(gclass_check_fsm(gclass)).toBe(0);
    });
});
