/***********************************************************************
 *          yui_row_search.js
 *
 *      ¿ESTÁ ESTE TÉRMINO EN ESTA FILA?
 *
 *      La caja de búsqueda de una tabla de treedb miraba los valores de
 *      la fila con `String(val)`, y una fila de treedb no es plana: un
 *      fkey llega como una LISTA DE OBJETOS
 *      `[{id, topic_name, hook_name}]`, y `String()` de eso es
 *      `"[object Object]"`.  O sea que buscar el taller de un equipo --
 *      que es donde vive el dato que un operador tiene en la cabeza --
 *      no encontraba nunca nada, y la caja no daba ninguna pista de que
 *      había mirado en otro sitio.
 *
 *      DOS REGLAS, Y LA SEGUNDA ES LA QUE HACE QUE SIRVA:
 *
 *      - Se baja por listas y objetos hasta una profundidad corta: un
 *        fkey está a dos niveles y nada de lo que se busca está más
 *        hondo.
 *      - **De un fkey se mira sólo el `id`.**  `topic_name` y
 *        `hook_name` son las MISMAS dos palabras en todas las filas, así
 *        que mirarlas convierte el término en un comodín: buscar
 *        "devices" traería el topic entero.  El `id` es lo único que
 *        nombra la cosa enlazada.
 *
 *      Las claves que empiezan por `_` no se miran en ningún nivel: son
 *      del armazón (`_check_box_state_`, `_operation`) o metadatos
 *      (`__md_treedb__`), y nadie busca por ellas.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

const MAX_DEPTH = 4;


/***************************************************************
 *  Un fkey, tal y como `nodes` lo contesta con `list_dict`.
 ***************************************************************/
function is_fkey_ref(value)
{
    return !!value
        && typeof value === "object"
        && !Array.isArray(value)
        && ("id" in value)
        && ("topic_name" in value)
        && ("hook_name" in value);
}

/***************************************************************
 *  ¿Contiene `value` el término? El término viene YA en
 *  minúsculas: quien busca lo baja una vez y no una por celda.
 ***************************************************************/
function value_matches(value, term, depth)
{
    if(value === null || value === undefined) {
        return false;
    }
    if(depth > MAX_DEPTH) {
        return false;
    }
    if(Array.isArray(value)) {
        return value.some((v) => value_matches(v, term, depth + 1));
    }
    if(typeof value === "object") {
        if(is_fkey_ref(value)) {
            return value_matches(value.id, term, depth + 1);
        }
        return Object.entries(value).some(([key, v]) => {
            if(key.startsWith("_")) {
                return false;
            }
            return value_matches(v, term, depth + 1);
        });
    }
    return String(value).toLowerCase().includes(term);
}

/***************************************************************
 *  ¿Está el término en alguna parte de esta fila?
 ***************************************************************/
function row_matches(row, term)
{
    if(!row || typeof row !== "object" || !term) {
        return false;
    }
    return Object.entries(row).some(([key, value]) => {
        if(key.startsWith("_")) {
            return false;
        }
        return value_matches(value, term, 0);
    });
}


export {row_matches, value_matches, is_fkey_ref};
