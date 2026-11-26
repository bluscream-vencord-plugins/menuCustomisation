/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { sleep } from "@utils/misc";
import { lodash } from "@webpack/common";

import { PATTERNS } from "./patterns";
import { applyLayout, getRecorded, logger, MenuLayout, MenuNode, record } from "./transform";

interface TrayEntry {
    key: string;
    label: string;
    type: string;
}

type TrayNode =
    | { key: string; label?: string; }
    | { separator: true; }
    | { submenu: { label: string; children: TrayNode[]; }; };

let running = false;
let lastSent = "";
let readLayout: () => MenuLayout | undefined = () => undefined;

export function trayHelpers() {
    if (IS_WEB || !isPluginEnabled(PATTERNS.nativeUtils)) return undefined;
    const helpers = VencordNative.pluginHelpers[PATTERNS.nativeUtils];
    return helpers?.getTrayEntries && helpers.setTrayLayout ? helpers : undefined;
}

const isTrayEntry = (value: unknown): value is TrayEntry => {
    if (typeof value !== "object" || value === null) return false;
    const { key, label, type } = value as Partial<TrayEntry>;
    return typeof key === "string" && typeof label === "string" && typeof type === "string";
};

const toNodes = (entries: TrayEntry[]): MenuNode[] => entries.map(e => e.type === "separator"
    ? { kind: "opaque", type: "separator", label: "" }
    : { kind: "item", type: e.type === "checkbox" ? PATTERNS.trayTypes.checkbox : PATTERNS.trayTypes.item, label: e.label, id: e.key, path: e.key });

function toTree(nodes: MenuNode[]): TrayNode[] {
    return nodes.flatMap((n): TrayNode[] => {
        if (n.kind === "group") return toTree(n.children ?? []);
        if (n.type === "separator") return [{ separator: true }];
        if (n.children) return [{ submenu: { label: n.label, children: toTree(n.children) } }];
        if (!n.id) return [];
        return [n.override?.label ? { key: n.id, label: n.override.label } : { key: n.id }];
    });
}

function disabledKeys(nodes: MenuNode[], into: string[] = []) {
    for (const n of nodes) {
        if (n.id && !n.children && n.override?.disabled) into.push(n.id);
        if (n.children) disabledKeys(n.children, into);
    }
    return into;
}

function itemKeys(nodes: MenuNode[], into = new Set<string>()) {
    for (const n of nodes) {
        if (n.id && !n.synthetic && !n.children) into.add(n.id);
        if (n.children) itemKeys(n.children, into);
    }
    return into;
}

export async function syncTray() {
    const native = trayHelpers();
    if (!native) return;
    const raw: unknown = await native.getTrayEntries();
    const entries = Array.isArray(raw) ? raw.filter(isTrayEntry) : [];
    if (entries.length) record(PATTERNS.trayNavId, toNodes(entries));

    const layout = readLayout();
    const recorded: MenuNode[] = getRecorded()[PATTERNS.trayNavId] ?? [];
    let payload: { tree: TrayNode[]; hidden: string[]; disabled: string[]; } | null = null;
    if (layout) {
        const all = itemKeys(lodash.cloneDeep(recorded));
        const placed = applyLayout(lodash.cloneDeep(recorded), layout);
        const kept = itemKeys(placed);
        payload = { tree: toTree(placed), hidden: [...all].filter(key => !kept.has(key)), disabled: disabledKeys(placed) };
    }
    const json = JSON.stringify(payload);
    if (json === lastSent) return;
    if (await native.setTrayLayout(payload) === true) lastSent = json;
}

async function loop() {
    while (running) {
        try {
            await syncTray();
        } catch (e) {
            logger.warn("Syncing the tray menu failed", e);
            lastSent = "";
        }
        await sleep(PATTERNS.traySyncMs);
    }
}

export function startTraySync(read: () => MenuLayout | undefined) {
    readLayout = read;
    running = true;
    lastSent = "";
    loop();
}

export function stopTraySync() {
    running = false;
    lastSent = "";
    trayHelpers()?.setTrayLayout(null).catch(e => logger.warn("Clearing the tray layout failed", e));
}
