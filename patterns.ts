/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Discord names, ids and keys this plugin relies on. */
export const PATTERNS = {
    /** Discord's Menu component, which flattens its children right after ContextMenuAPI patched them. */
    menuFind: "Menu API only allows Items",
    /** The argument of that flatten call (`}(o)`), so our transform runs after every nav and global menu patch. */
    menuMatch: /(?<=Menu API only allows.{0,150}?\},\[\]\)\}\()\i(?=\))/,
    /** Separates submenu ids in an item path, e.g. "mute-channel/1h". */
    pathSeparator: "/",
    /** A rule key ending in this matches every id starting with the rest. */
    wildcard: "*",
    /** Prefix of submenus created by this plugin. */
    submenuPrefix: "vc-mc-sub-",
    /** The "Customise this menu…" item and its group. */
    customiseItem: "vc-mc-customise",
    customiseLabel: "Customise this menu…",
    /** DataStore key for the menus seen so far. Local only, never synced. */
    recordingKey: "MenuCustomisation_seen",
    recordingSaveDelay: 2000
};
