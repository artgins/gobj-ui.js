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
    "A Tabulator data table with static rows, built directly in the view (the pattern the yunos use, e.g. gui_agent's node list). Click a header to sort, click a row to select; the Status column uses a coloured-tag formatter.": "Una tabla de datos Tabulator con filas estáticas, construida directamente en la vista (el patrón que usan los yunos, p. ej. la lista de nodos de gui_agent). Pulsa una cabecera para ordenar, pulsa una fila para seleccionar; la columna Estado usa un formateador de etiqueta con color."
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
