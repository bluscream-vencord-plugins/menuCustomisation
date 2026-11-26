/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";
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
        loadRecording();
    },

    stop() {
        stopRecording();
    }
});
