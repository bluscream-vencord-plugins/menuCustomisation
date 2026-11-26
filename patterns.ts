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
    /** Separates submenu ids in an item path. A control character, so it can't appear in ids that embed user names. */
    pathSeparator: "\u001f",
    /** How a path separator is shown in the editor, e.g. "mute-channel › 3600". */
    pathDisplaySeparator: " › ",
    /** A rule key ending in this matches every id starting with the rest. */
    wildcard: "*",
    /** A run of digits this long in an id is a Discord id (user, channel, role…), recorded as a wildcard. */
    dynamicId: /\d{15,}/,
    /** Prefix of submenus created by this plugin. */
    submenuPrefix: "vc-mc-sub-",
    /** The "Customise this menu…" item and its group. */
    customiseItem: "vc-mc-customise",
    customiseLabel: "Customise this menu…",
    /** DataStore key for the menus seen so far. Local only, never synced. */
    recordingKey: "MenuCustomisation_seen",
    recordingSaveDelay: 2000,
    /** Recording caps, so menus listing every server, role or channel can't grow the store without bound. */
    maxChildrenPerLevel: 50,
    maxNodesPerMenu: 500,
    /** The "Put into" choice that keeps an item where Discord put it. */
    keepPlace: "\u0000keep",
    /** Icon override that removes an item's icon. */
    iconNone: "none",
    /** Icon override choice that switches to entering an image address. */
    iconUrlChoice: "\u0000url",
    /** Only images from https addresses are used as icons. */
    imageUrlProtocol: "https:",
    /** Colours Discord's menu items support (`color` prop). */
    colors: ["default", "brand", "danger", "premium", "success"]
};
