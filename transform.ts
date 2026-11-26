/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { proxyLazy } from "@utils/lazy";
import { Logger } from "@utils/Logger";
import { lodash, Menu, React } from "@webpack/common";
import type { ReactElement, ReactNode } from "react";

import { PATTERNS } from "./patterns";

export const logger = new Logger("MenuCustomisation");

export interface Move {
    item: string;
    into: string;
    anchor?: string;
    before?: boolean;
}

export interface MenuLayout {
    hidden: string[];
    renames: Record<string, string>;
    submenus: Record<string, { label: string; }>;
    moves: Move[];
}

export const emptyLayout = (): MenuLayout => ({ hidden: [], renames: {}, submenus: {}, moves: [] });

export type NodeKind = "group" | "submenu" | "item" | "opaque";

interface ItemProps {
    id?: string;
    label?: ReactNode;
    children?: ReactNode;
    render?: unknown;
}

type MenuElement = ReactElement<ItemProps>;

export interface MenuNode {
    kind: NodeKind;
    type: string;
    label: string;
    id?: string;
    path?: string;
    children?: MenuNode[];
    synthetic?: boolean;
    renamed?: boolean;
    el?: MenuElement;
}

export type RecordedNode = Omit<MenuNode, "el" | "children"> & { children?: RecordedNode[]; };

function textOf(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (React.isValidElement<{ children?: ReactNode; }>(node)) return textOf(node.props.children);
    return "";
}

function typeName(el: MenuElement): string {
    if (el.type === Menu.MenuGroup) return "group";
    if (el.type === Menu.MenuItem) return el.props.render ? "custom" : el.props.children ? "submenu" : "item";
    if (el.type === Menu.MenuCheckboxItem) return "checkbox";
    if (el.type === Menu.MenuRadioItem) return "radio";
    if (el.type === Menu.MenuControlItem) return "control";
    if (el.type === Menu.MenuSeparator) return "separator";
    return "other";
}

function flatten(children: ReactNode, out: MenuElement[] = []): MenuElement[] {
    if (Array.isArray(children)) children.forEach(c => flatten(c, out));
    else if (React.isValidElement<ItemProps>(children)) {
        if (children.type === React.Fragment) flatten(children.props.children, out);
        else out.push(children);
    }
    return out;
}

export function parse(children: ReactNode, parentPath = ""): MenuNode[] {
    return flatten(children).map(el => {
        const type = typeName(el);
        if (type === "group") return { kind: "group", type, label: "", el, children: parse(el.props.children, parentPath) };
        const { id } = el.props;
        if (!id) return { kind: "opaque", type, label: textOf(el.props.label), el };
        const path = parentPath ? parentPath + PATTERNS.pathSeparator + id : id;
        const label = textOf(el.props.label) || id;
        if (type === "submenu") return { kind: "submenu", type, label, id, path, el, children: parse(el.props.children, path) };
        return { kind: "item", type, label, id, path, el };
    });
}

interface Entry {
    node: MenuNode;
    parent: MenuNode[];
    container: string;
}

function index(nodes: MenuNode[], container: string, map: Map<string, Entry>) {
    for (const node of nodes) {
        if (node.kind === "group" && node.children) index(node.children, container, map);
        else if (node.path) {
            if (!map.has(node.path)) map.set(node.path, { node, parent: nodes, container });
            if (node.kind === "submenu" && node.children) index(node.children, node.path, map);
        }
    }
    return map;
}

const lastSegment = (key: string) => key.slice(key.lastIndexOf(PATTERNS.pathSeparator) + 1);

function resolve(map: Map<string, Entry>, key: string): Entry | undefined {
    const exact = map.get(key);
    if (exact) return exact;
    const id = lastSegment(key);
    const prefix = id.endsWith(PATTERNS.wildcard) ? id.slice(0, -1) : null;
    for (const entry of map.values()) {
        const nodeId = entry.node.id ?? "";
        if (prefix !== null ? nodeId.startsWith(prefix) : nodeId === id) return entry;
    }
}

function resolveAll(map: Map<string, Entry>, key: string): Entry[] {
    if (!key.endsWith(PATTERNS.wildcard)) {
        const entry = resolve(map, key);
        return entry ? [entry] : [];
    }
    const prefix = lastSegment(key).slice(0, -1);
    return [...map.values()].filter(e => e.node.id?.startsWith(prefix));
}

function detach(entry: Entry) {
    const i = entry.parent.indexOf(entry.node);
    if (i !== -1) entry.parent.splice(i, 1);
}

/** Applies a layout to a parsed menu in place and returns it. Used for real menus and for the editor's preview. */
export function applyLayout(root: MenuNode[], layout: MenuLayout): MenuNode[] {
    const map = index(root, "", new Map());

    for (const key of layout.hidden) resolveAll(map, key).forEach(e => { detach(e); map.delete(e.node.path ?? ""); });

    const containerOf = (into: string, member: Entry): { list: MenuNode[]; container: string; } | null => {
        if (!into) return { list: root, container: "" };
        const existing = map.get(into) ?? resolve(map, into);
        if (existing) return existing.node.children ? { list: existing.node.children, container: existing.node.path ?? into } : null;
        const submenu = layout.submenus[into];
        if (!submenu) return null;
        const node: MenuNode = { kind: "submenu", type: "submenu", label: submenu.label, id: into, path: into, children: [], synthetic: true };
        member.parent.splice(member.parent.indexOf(member.node), 0, node);
        map.set(into, { node, parent: member.parent, container: member.container });
        return { list: node.children ?? [], container: into };
    };

    for (const move of layout.moves) {
        const entry = resolve(map, move.item);
        if (!entry || entry.node.path === move.into) continue;
        const target = containerOf(move.into, entry);
        if (!target || target.list.some(n => n !== entry.node && n.id && n.id === entry.node.id)) continue;
        detach(entry);
        const anchor = move.anchor ? resolve(map, move.anchor) : undefined;
        if (anchor && anchor.container === target.container && anchor.node !== entry.node) {
            const i = anchor.parent.indexOf(anchor.node);
            anchor.parent.splice(move.before ? i : i + 1, 0, entry.node);
            entry.parent = anchor.parent;
        } else {
            target.list.push(entry.node);
            entry.parent = target.list;
        }
        entry.container = target.container;
    }

    for (const [key, label] of Object.entries(layout.renames)) {
        const entry = resolve(map, key);
        if (entry && label) Object.assign(entry.node, { label, renamed: true });
    }

    const prune = (nodes: MenuNode[]) => {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (node.children) prune(node.children);
            if (node.synthetic && !node.children?.length) nodes.splice(i, 1);
        }
    };
    prune(root);
    return root;
}

function toElements(nodes: MenuNode[]): ReactNode[] {
    return nodes.map(node => {
        const children = node.children && toElements(node.children);
        if (node.synthetic) return React.createElement(Menu.MenuItem, { key: node.id, id: node.id ?? "", label: node.label }, children);
        const { el } = node;
        if (!el) return null;
        if (children) el.props.children = children;
        if (node.renamed) el.props.label = node.label;
        return el;
    });
}

const toRecorded = (nodes: MenuNode[]): RecordedNode[] =>
    nodes.map(({ el, children, ...rest }) => children ? { ...rest, children: toRecorded(children) } : rest);

const signature = (nodes: RecordedNode[]): string =>
    nodes.map(n => (n.id ?? n.kind) + (n.children ? `[${signature(n.children)}]` : "")).join(",");

function pathsOf(nodes: RecordedNode[], into: Set<string> = new Set()) {
    for (const n of nodes) {
        if (n.path) into.add(n.path);
        if (n.children) pathsOf(n.children, into);
    }
    return into;
}

function merge(fresh: RecordedNode[], old: RecordedNode[] | undefined): RecordedNode[] {
    if (!old) return fresh;
    const known = pathsOf(fresh);
    const missing: RecordedNode[] = [];
    const collect = (nodes: RecordedNode[]) => nodes.forEach(n => {
        if (n.kind === "group" && n.children) collect(n.children);
        else if (n.path && !known.has(n.path)) missing.push(n);
        else if (n.children) collect(n.children);
    });
    collect(old);
    return missing.length ? [...fresh, { kind: "group", type: "group", label: "", children: missing }] : fresh;
}

let recorded: Record<string, RecordedNode[]> = {};
const signatures = new Map<string, string>();
const failedMenus = new Set<string>();
const listeners = new Set<() => void>();

const saveRecording = proxyLazy(() => lodash.debounce(() => DataStore.set(PATTERNS.recordingKey, recorded), PATTERNS.recordingSaveDelay));

export async function loadRecording() {
    recorded = await DataStore.get<Record<string, RecordedNode[]>>(PATTERNS.recordingKey) ?? {};
    listeners.forEach(l => l());
}

export function flushRecording() {
    saveRecording.flush();
}

export const getRecorded = () => recorded;

export function subscribeRecording(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function forgetRecording(navId: string) {
    const { [navId]: _, ...rest } = recorded;
    recorded = rest;
    signatures.delete(navId);
    saveRecording();
    listeners.forEach(l => l());
}

function record(navId: string, nodes: MenuNode[]) {
    const fresh = toRecorded(nodes);
    const sig = signature(fresh);
    if (signatures.get(navId) === sig) return;
    signatures.set(navId, sig);
    recorded = { ...recorded, [navId]: merge(fresh, recorded[navId]) };
    saveRecording();
    listeners.forEach(l => l());
}

export function transform(children: ReactNode, navId: string, layout: MenuLayout | undefined, extra: ReactNode): ReactNode {
    if (!navId || !Menu.MenuItem) return children;
    try {
        const nodes = parse(children);
        record(navId, nodes);
        if (!layout) return extra ? [children, extra] : children;
        const out = toElements(applyLayout(nodes, layout));
        return extra ? [...out, extra] : out;
    } catch (e) {
        if (!failedMenus.has(navId)) {
            failedMenus.add(navId);
            logger.error(`Customising ${navId} failed, showing it unchanged.`, e);
        }
        return children;
    }
}
