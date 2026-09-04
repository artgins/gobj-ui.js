/***********************************************************************
 *          yui_table_filter_clear.js
 *
 *      LA ✕ DE LOS FILTROS DE CABECERA DE UNA TABULATOR.
 *
 *      Un filtro de columna se pone escribiendo y se quita BORRANDO lo
 *      escrito, letra a letra, y no hay nada en la cabecera que diga
 *      que se puede quitar.  Con varias columnas filtradas, volver a
 *      ver la tabla entera es un ejercicio de memoria: cuáles toqué.
 *      La ✕ lo dice y lo hace.
 *
 *      TRES DECISIONES QUE NO SON OBVIAS:
 *
 *      - **Se ve mientras el filtro tenga contenido, con foco o sin
 *        él.**  Es al revés que la ✕ de un formulario
 *        (`yui_inputs.js`), que sólo aparece en el campo que se está
 *        editando para no encender un aspa en cada campo relleno.  Aquí
 *        el caso de uso es justo el contrario: el filtro ya está puesto,
 *        el foco está en otra parte, y lo que se quiere es verlo y
 *        quitarlo.  Escondida tras el foco harían falta dos clics.
 *
 *      - **Se borra con la API, no simulando teclas.**
 *        `setHeaderFilterValue(field, "")` es lo que Tabulator ofrece, y
 *        deja el valor y el filtro consistentes.  Sintetizar un `input`
 *        sobre el `<input>` depende de a qué escuche el editor de ese
 *        filtro, que cambia con el tipo de columna.
 *
 *      - **Se recorre la cabecera, no se envuelve el editor.**  Las
 *        columnas se construyen del esquema del topic, así que no hay un
 *        sitio único donde envolver el editor; y la cabecera se rehace
 *        sola cuando cambian las columnas.  El recorrido es idempotente
 *        -- marca lo que ya tiene aspa -- y se dispara con un
 *        `querySelector` de una sola pasada, así que repetirlo en cada
 *        render no cuesta nada.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import i18next from "i18next";

import {createElement2} from "@yuneta/gobj-js";

import "./yui_table_filter_clear.css";


const MARK = "data-yui-filter-clear";


/***************************************************************
 *  Pon (o repón) la ✕ de cada filtro de cabecera de `table`.
 *
 *  Idempotente: los que ya la tienen se saltan.
 ***************************************************************/
function decorate(table)
{
    if(!table || !table.element) {
        return;
    }
    let $pending = table.element.querySelector(`.tabulator-header-filter:not([${MARK}])`);
    if(!$pending) {
        return;     /*  nada nuevo en la cabecera  */
    }

    let list = table.element.querySelectorAll(`.tabulator-header-filter:not([${MARK}])`);
    for(const $filter of list) {
        $filter.setAttribute(MARK, "1");

        let $input = $filter.querySelector("input");
        if(!$input) {
            continue;   /*  un filtro que no se escribe: un select, un rango  */
        }

        /*  El campo se lee del `.tabulator-col` que lo contiene, que es
         *  quien lo lleva; el `<input>` no sabe de qué columna es.  */
        let $col = $filter.closest(".tabulator-col");
        let field = $col? $col.getAttribute("tabulator-field"): "";
        if(!field) {
            continue;   /*  sin campo no hay a quién decirle que se limpie  */
        }

        $filter.classList.add("yui-filter-has-clear");

        /*  La clave viaja con el botón: un `title` puesto con t() al
         *  construir es invisible para refresh_language(), y se queda en
         *  el idioma de aquel momento para siempre.  */
        let $btn = createElement2(["button", {
            type:                   "button",
            class:                  "delete is-small yui-filter-clear",
            tabindex:               "-1",
            title:                  i18next.t("clear"),
            "aria-label":           i18next.t("clear"),
            "data-i18n-title":      "clear",
            "data-i18n-aria-label": "clear"
        }]);

        const sync = () => {
            $btn.classList.toggle("is-visible", !!$input.value);
        };

        $input.addEventListener("input", sync);
        $input.addEventListener("change", sync);
        $btn.addEventListener("click", (event) => {
            event.stopPropagation();    /*  no ordenar la columna al pulsar  */
            table.setHeaderFilterValue(field, "");
            sync();
        });

        $filter.appendChild($btn);
        sync();
    }
}

/***************************************************************
 *  Engancha la ✕ a una tabla ya creada.
 *
 *  Se llama una vez, con la tabla construida.  Los enganches
 *  cubren los dos momentos en que la cabecera aparece o se
 *  rehace: cuando se construye y cuando cambian las columnas.
 ***************************************************************/
export function yui_table_filter_clear(table)
{
    if(!table) {
        return;
    }
    decorate(table);
    table.on("renderComplete", () => {
        decorate(table);
    });
    table.on("columnVisibilityChanged", () => {
        decorate(table);
    });
}

/***************************************************************
 *  Repasa el estado de las ✕ tras un cambio que no vino del
 *  teclado -- limpiar todos los filtros, cargar una vista
 *  guardada -- porque eso no dispara `input`.
 ***************************************************************/
export function yui_table_filter_clear_refresh(table)
{
    if(!table || !table.element) {
        return;
    }
    for(const $filter of table.element.querySelectorAll(".yui-filter-has-clear")) {
        let $input = $filter.querySelector("input");
        let $btn = $filter.querySelector(".yui-filter-clear");
        if($input && $btn) {
            $btn.classList.toggle("is-visible", !!$input.value);
        }
    }
}
