/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { Logger } from "@utils/Logger";
import { sleep } from "@utils/misc";
import definePlugin from "@utils/types";
import { lodash, Menu } from "@webpack/common";
import type { ReactNode } from "react";

import { openEditor, settings } from "./editor";
import { PATTERNS } from "./patterns";
import { loadRecording, normaliseLayout, stopRecording, transform } from "./transform";

function customiseItem(navId: string): ReactNode {
    if (!settings.store.customiseItem) return null;
    return (
        <Menu.MenuGroup key={PATTERNS.customiseItem}>
            <Menu.MenuItem id={PATTERNS.customiseItem} label={PATTERNS.customiseLabel} action={() => openEditor(navId)} />
        </Menu.MenuGroup>
    );
}

const logger = new Logger("MenuCustomisation");
let trayRunning = false;

function nativeUtils() {
    if (IS_WEB || !isPluginEnabled(PATTERNS.nativeUtils)) return undefined;
    const helpers = VencordNative.pluginHelpers[PATTERNS.nativeUtils];
    return helpers?.setTrayItems && helpers.waitTrayClick ? helpers : undefined;
}

async function trayLoop() {
    let registered = false;
    while (trayRunning) {
        const native = nativeUtils();
        if (!native) {
            registered = false;
            await sleep(PATTERNS.trayRetryDelayMs);
            continue;
        }
        try {
            if (!registered) registered = await native.setTrayItems(PATTERNS.trayOwner, [{ ...PATTERNS.trayItem, type: "normal" }]) === true;
            const id = await native.waitTrayClick(PATTERNS.trayOwner);
            if (trayRunning && id === PATTERNS.trayItem.id) {
                VesktopNative?.win?.focus?.();
                openEditor("");
            }
        } catch (e) {
            logger.warn("Tray item failed", e);
            registered = false;
            await sleep(PATTERNS.trayRetryDelayMs);
        }
    }
}

export default definePlugin({
    name: "MenuCustomisation",
    description: "Hide, rename, reorder and group the items of any right-click menu, including ones other plugins add.",
    authors: [
        { name: "Bluscream", id: 467777925790564352n },
        { name: "Claude Opus 5.5", id: 0n }
    ],
    dependencies: ["ContextMenuAPI"],
    settings,

    patches: [
        {
            find: PATTERNS.menuFind,
            replacement: {
                match: PATTERNS.menuMatch,
                replace: "$self.customise($&,arguments[0].navId)"
            }
        }
    ],

    customise(children: ReactNode, navId: string) {
        const layout = settings.plain.layouts?.[navId];
        return transform(children, navId, layout && normaliseLayout(layout), customiseItem(navId));
    },

    start() {
        const { layouts } = settings.plain;
        if (layouts && Object.values(layouts).some(l => "renames" in l))
            settings.store.layouts = lodash.cloneDeep(lodash.mapValues(layouts, normaliseLayout));
        loadRecording();
        trayRunning = true;
        trayLoop();
    },

    stop() {
        trayRunning = false;
        nativeUtils()?.setTrayItems(PATTERNS.trayOwner, []).catch(e => logger.warn("Clearing the tray item failed", e));
        stopRecording();
    }
});
