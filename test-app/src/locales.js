/***********************************************************************
 *          locales.js
 *
 *      i18n (i18next) for the demo — English / Spanish. English is the
 *      source: keys ARE the English strings the UI ships (nav labels,
 *      toolbar labels, view titles and leads), so the `en` bundle is
 *      empty and every key falls back to itself. The `es` bundle below
 *      translates them.
 *
 *      One shared i18next instance (deduped in vite.config.js) is used
 *      by this file, the shell and C_YUI_FORM. `setup_locale()` inits
 *      it; `toggle_locale()` flips the language; callers then
 *      refresh_language(document.body, t) to repaint.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import i18next from "i18next";

const es_translation = {
    "Last saved record:": "Último registro guardado:",
    "name": "nombre",
    "email": "correo",
    "age": "edad",
    "role": "rol",
    "active": "activo",
    "notes": "notas",
    "save": "Guardar",
    "undo": "Deshacer",
    "clear": "Limpiar",
    "copy": "Copiar",
    "paste": "Pegar",
    "update": "actualizar",
    "create": "crear",
    "About": "Acerca de",
    "gobj-ui demo": "demo de gobj-ui",
    "App": "App",
    "JSON editor": "Editor JSON",
    "close": "cerrar",
    "TreeDB": "TreeDB",
    "Last published record event:": "Último evento de registro publicado:",
    "edit": "Editar",
    "new": "Nuevo",
    "delete": "Borrar",
    "refresh": "Refrescar",
    "rows": "filas",
    "users": "usuarios",
    "All changes will be lost. Are you sure?": "Se perderán todos los cambios. ¿Seguro?",
    "department": "departamento",
    "teams": "equipos",
    "Go to Tabs": "Ir a Pestañas",
    "Go to Cards": "Ir a Tarjetas",
    "Toggle theme": "Cambiar tema",
    "Toggle language": "Cambiar idioma",
    "Toggle dark theme": "Cambiar tema oscuro",
    "Open drawer": "Abrir cajón",
    "Demo menu": "Menú demo",
    "Home": "Inicio",
    "Tabs": "Pestañas",
    "Side submenu": "Submenú lateral",
    "Cards": "Tarjetas",
    "Accordion": "Acordeón",
    "Form": "Formulario",
    "Table": "Tabla",
    "Tab A": "Pestaña A",
    "Tab B": "Pestaña B",
    "Tab C": "Pestaña C",
    "Account": "Cuenta",
    "Security": "Seguridad",
    "Profile": "Perfil",
    "Sessions": "Sesiones",
    "Tokens": "Tokens",
    "Alpha": "Alfa",
    "Beta": "Beta",
    "Gamma": "Gamma",
    "Delta": "Delta",
    "Chart": "Gráfica",
    "Gobj tree": "Árbol de gobjs",
    "JSON graph": "Grafo JSON",
    "Wizard": "Asistente",
    "Pager": "Paginador",
    "Map": "Mapa",
    "The gobj-ui uPlot component C_YUI_UPLOT. Series are added with EV_ADD_SERIE and rows fed with EV_LOAD_DATA (a unix-epoch-seconds x-axis). Hover to read values; drag to zoom. Fully offline.":
        "El componente uPlot de gobj-ui, C_YUI_UPLOT. Las series se añaden con EV_ADD_SERIE y las filas se alimentan con EV_LOAD_DATA (eje X en segundos epoch unix). Pasa el ratón para ver valores; arrastra para hacer zoom. Totalmente offline.",
    "C_YUI_GOBJ_TREE_JS introspects the running yuno and draws its live gobj tree with G6 — self-referential: you see the yuno, this view and the tree component itself. Use the toolbar to zoom, center, and expand/collapse. No data, no backend.":
        "C_YUI_GOBJ_TREE_JS introspecciona el yuno en marcha y dibuja su árbol de gobjs vivo con G6 — autorreferencial: ves el yuno, esta vista y el propio componente del árbol. Usa la barra para hacer zoom, centrar y plegar/desplegar. Sin datos, sin backend.",
    "C_YUI_JSON_GRAPH renders an arbitrary JSON value as a hierarchical graph (objects/arrays as group nodes, scalars as rows). Click a node to emit EV_JSON_ITEM_CLICKED. Fully offline.":
        "C_YUI_JSON_GRAPH pinta un valor JSON arbitrario como un grafo jerárquico (objetos/arrays como nodos de grupo, escalares como filas). Pulsa un nodo para emitir EV_JSON_ITEM_CLICKED. Totalmente offline.",
    "C_YUI_WIZARD walks ordered steps with a title + \"N / M\" counter + Back/Next, turning into Confirm on the last step. Steps are fed with EV_SET_STEPS; Confirm publishes EV_WIZARD_DONE (echoed below the wizard). Fully offline.":
        "C_YUI_WIZARD recorre pasos ordenados con un título + contador \"N / M\" + Atrás/Siguiente, que pasa a Confirmar en el último paso. Los pasos se alimentan con EV_SET_STEPS; Confirmar publica EV_WIZARD_DONE (mostrado bajo el asistente). Totalmente offline.",
    "C_YUI_PAGER stacks panels with a \"← title\" header (drill-down, no confirm chrome). Push a page with the button, pop back with the header \"←\". Pages here are plain content; a real one would push a C_YUI_FORM. Fully offline.":
        "C_YUI_PAGER apila paneles con una cabecera \"← título\" (navegación en profundidad, sin chrome de confirmación). Empuja una página con el botón, vuelve con el \"←\" de la cabecera. Aquí las páginas son contenido simple; una real empujaría un C_YUI_FORM. Totalmente offline.",
    "C_YUI_MAP (MapLibre) rendered into an external sized element, with a few Spanish cities as markers. NOTE: the basemap tiles come from tiles.openfreemap.org, so this chapter needs network; offline it shows a blank map with controls.":
        "C_YUI_MAP (MapLibre) renderizado en un elemento externo dimensionado, con varias ciudades españolas como marcadores. NOTA: los tiles del mapa base vienen de tiles.openfreemap.org, así que este capítulo necesita red; offline muestra un mapa en blanco con controles.",
    "Tabs — Tab A": "Pestañas — Pestaña A",
    "Tabs — Tab B": "Pestañas — Pestaña B",
    "Tabs — Tab C": "Pestañas — Pestaña C",
    "Side submenu — Profile": "Submenú lateral — Perfil",
    "Side submenu — Sessions": "Submenú lateral — Sesiones",
    "Side submenu — Tokens": "Submenú lateral — Tokens",
    "Cards — Alpha": "Tarjetas — Alfa",
    "Cards — Beta": "Tarjetas — Beta",
    "Cards — Gamma": "Tarjetas — Gamma",
    "Cards — Delta": "Tarjetas — Delta",
    "The secondary nav above is layout \"tabs\": a Bulma .tabs strip in the top-sub zone. Tab strips have no room for section headers, so decorative header/divider items are silently dropped here.": "El nav secundario de arriba es el layout \"tabs\": una tira .tabs de Bulma en la zona top-sub. Las tiras de pestañas no tienen espacio para cabeceras de sección, así que aquí los elementos decorativos header/divider se descartan en silencio.",
    "Same tab strip; a different leaf mounted in the main stage. keep_alive: switch tabs and come back — the instance number below does not change.": "La misma tira de pestañas; una hoja distinta montada en el stage principal. keep_alive: cambia de pestaña y vuelve — el número de instancia de abajo no cambia.",
    "This leaf is lazy_destroy: leave it and it is destroyed; return and the instance number below has incremented (a fresh gobj was built).": "Esta hoja es lazy_destroy: al salir se destruye; al volver, el número de instancia de abajo ha aumentado (se construyó un gobj nuevo).",
    "The right-hand list is layout \"submenu\": a Bulma .menu with a heading. Unlike tabs, it renders decorative type:\"header\" and type:\"divider\" items — see the \"Account\" / \"Security\" group labels.": "La lista de la derecha es el layout \"submenu\": un .menu de Bulma con un encabezado. A diferencia de las pestañas, sí pinta los elementos decorativos type:\"header\" y type:\"divider\" — mira las etiquetas de grupo \"Cuenta\" / \"Seguridad\".",
    "Grouping without a third nav level: header + divider items chunk the list visually while the route tree stays two levels deep.": "Agrupación sin un tercer nivel de navegación: los elementos header + divider fragmentan la lista visualmente mientras el árbol de rutas se mantiene en dos niveles.",
    "On mobile the right zone is hidden (show_on \">=desktop\") — resize the window narrow and this secondary nav collapses; the primary icon-bar at the bottom takes over.": "En móvil la zona derecha se oculta (show_on \">=desktop\"): estrecha la ventana y este nav secundario se colapsa; la barra de iconos primaria de abajo toma el relevo.",
    "You reached this from the CARDS landing at /cards (layout \"cards\": a grid of tappable cards, one per item). On desktop a tab strip is available on top; on mobile a \"< Cards\" backbar replaces it.": "Llegaste aquí desde la página de TARJETAS en /cards (layout \"cards\": una rejilla de tarjetas pulsables, una por elemento). En escritorio hay una tira de pestañas arriba; en móvil una backbar \"< Tarjetas\" la reemplaza.",
    "Navigate back to /cards (brand → then the Cards item, or the backbar on mobile) to see the card grid landing itself.": "Vuelve a /cards (marca → luego el elemento Tarjetas, o la backbar en móvil) para ver la propia página de rejilla de tarjetas.",
    "The cards landing is a resting, deep-linkable route (unlike Tabs/Submenu, whose bare parent route redirects to the first child).": "La página de tarjetas es una ruta estable y enlazable directamente (a diferencia de Pestañas/Submenú, cuya ruta padre redirige a la primera hoja).",
    "Four cards, four leaves. Add a fifth item to submenu.items and the grid grows automatically.": "Cuatro tarjetas, cuatro hojas. Añade un quinto elemento a submenu.items y la rejilla crece automáticamente.",
    "Accordion is a PRIMARY-zone layout: its first-level entries are collapsible sections and their bodies are the second-level items. Because those bodies are the routable 2nd level, accordion can't be a 3rd-level submenu — so this chapter embeds a live accordion nav below. Click a section head to expand; click a leaf to navigate for real.": "El acordeón es un layout de zona PRIMARIA: sus entradas de primer nivel son secciones plegables y sus cuerpos son los elementos de segundo nivel. Como esos cuerpos son el 2º nivel enrutable, el acordeón no puede ser un submenú de 3er nivel, así que este capítulo embebe un nav acordeón vivo abajo. Pulsa la cabecera de una sección para desplegarla; pulsa una hoja para navegar de verdad.",
    "This is the gobj-ui form component C_YUI_FORM, hosted as a child. Fields come from a declarative template; edit any value and press Save (floppy icon) — the component publishes EV_SAVE_RECORD and the submitted JSON appears below.": "Este es el componente de formulario de gobj-ui C_YUI_FORM, alojado como hijo. Los campos vienen de una plantilla declarativa; edita cualquier valor y pulsa Guardar (icono de disquete) — el componente publica EV_SAVE_RECORD y el JSON enviado aparece abajo.",
    "A Tabulator data table with static rows, built directly in the view (the pattern the yunos use, e.g. gui_agent's node list). Click a header to sort, click a row to select; the Status column uses a coloured-tag formatter.": "Una tabla de datos Tabulator con filas estáticas, construida directamente en la vista (el patrón que usan los yunos, p. ej. la lista de nodos de gui_agent). Pulsa una cabecera para ordenar, pulsa una fila para seleccionar; la columna Estado usa un formateador de etiqueta con color.",
    "Modals": "Modales",
    "The volatil-modal helpers of c_yui_main.js: blocking questions (get_yesnocancel / get_yesno / get_ok) and typed messages (info / warning / error, tinted round icon + accent-colored accept). Enter answers yes, Escape cancels or dismisses — repeat presses never stack a second modal. Each answer is echoed below the buttons. Fully offline.":
        "Los helpers de modales volátiles de c_yui_main.js: preguntas bloqueantes (get_yesnocancel / get_yesno / get_ok) y mensajes tipados (info / aviso / error, icono redondo tintado + aceptar en color de acento). Enter responde sí, Escape cancela o descarta — pulsar repetidamente nunca apila un segundo modal. Cada respuesta se muestra bajo los botones. Totalmente offline.",
    "yes / no / cancel": "sí / no / cancelar",
    "yes / no": "sí / no",
    "ok": "ok",
    "info": "info",
    "warning": "aviso",
    "error": "error",
    "yes": "sí",
    "no": "no",
    "cancel": "cancelar",
    "accept": "aceptar",
    "Delete the selected records?": "¿Borrar los registros seleccionados?",
    "Operation completed.": "Operación completada.",
    "This node runs release 7.7.2.": "Este nodo ejecuta la release 7.7.2.",
    "The connection is unstable.": "La conexión es inestable.",
    "The yuno did not answer.": "El yuno no respondió."
};

export const resources = {
    en: {name: "English", translation: {}},
    es: {name: "Español", translation: es_translation},
};

export function setup_locale(lng = "en")
{
    i18next.init({
        lng:          lng,
        fallbackLng:  "en",     // missing es key → English (the key itself)
        resources:    resources,
        initImmediate: false,
    });
    return i18next.language || lng;
}

export function current_locale()
{
    return i18next.language || "en";
}

export function toggle_locale()
{
    let next = current_locale() === "es" ? "en" : "es";
    i18next.changeLanguage(next);
    return next;
}
