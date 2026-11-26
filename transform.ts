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

import { resolveIcon } from "./icons";
import { PATTERNS } from "./patterns";

export const logger = new Logger("MenuCustomisation");

const SEP = PATTERNS.pathSeparator;
const WILD = PATTERNS.wildcard;

export interface Move {
    item: string;
    into: string;
    anchor?: string;
    before?: boolean;
}

export interface ItemOverride {
    label?: string;
    subtext?: string;
    color?: string;
    icon?: string;
    disabled?: boolean;
}

export interface MenuLayout {
    hidden: string[];
    overrides: Record<string, ItemOverride>;
    submenus: Record<string, { label: string; }>;
    moves: Move[];
}

type StoredLayout = Partial<MenuLayout> & { renames?: Record<string, string>; };

export const emptyLayout = (): MenuLayout => ({ hidden: [], overrides: {}, submenus: {}, moves: [] });

export function normaliseLayout(layout?: StoredLayout): MenuLayout {
    const { renames, ...rest } = layout ?? {};
    const fromRenames = lodash.mapValues(renames ?? {}, (label): ItemOverride => ({ label }));
    return { ...emptyLayout(), ...rest, overrides: { ...fromRenames, ...rest.overrides } };
}

export const isEmptyLayout = (layout: MenuLayout) =>
    !layout.hidden.length && !layout.moves.length && !Object.keys(layout.overrides).length && !Object.keys(layout.submenus).length;

const OVERRIDABLE: Record<string, Array<keyof ItemOverride>> = {
    item: ["label", "subtext", "color", "icon", "disabled"],
    submenu: ["label", "subtext", "color", "icon", "disabled"],
    checkbox: ["label", "subtext", "disabled"],
    radio: ["label", "subtext", "disabled"],
    [PATTERNS.trayTypes.item]: ["label", "disabled"],
    [PATTERNS.trayTypes.checkbox]: ["label", "disabled"]
};

export const overridableFields = (type: string) => OVERRIDABLE[type] ?? [];

export type NodeKind = "group" | "submenu" | "item" | "opaque";

interface ItemProps {
    id?: string;
    label?: ReactNode;
    subtext?: ReactNode;
    color?: string;
    icon?: unknown;
    leadingAccessory?: unknown;
    disabled?: boolean;
    children?: ReactNode;
    render?: unknown;
    action?: unknown;
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
    override?: ItemOverride;
    emptied?: boolean;
    el?: MenuElement;
}

export type RecordedNode = Omit<MenuNode, "el" | "children"> & { children?: RecordedNode[]; };

function isElement(node: unknown): node is MenuElement {
    return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

function textOf(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (isElement(node)) return textOf(node.props.children);
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
    else if (isElement(children)) {
        if (children.type === React.Fragment) flatten(children.props.children, out);
        else out.push(children);
    }
    return out;
}

export const joinPath = (parent: string, id: string) => parent ? parent + SEP + id : id;
export const parentOf = (path: string) => path.includes(SEP) ? path.slice(0, path.lastIndexOf(SEP)) : "";
export const lastSegment = (key: string) => key.slice(key.lastIndexOf(SEP) + 1);
export const displayPath = (path: string) => path.split(SEP).join(PATTERNS.pathDisplaySeparator);

export function keyMatches(key: string, node: { id?: string; path?: string; }): boolean {
    if (!node.id) return false;
    if (key === node.path) return true;
    const id = lastSegment(key);
    if (id === node.id) return true;
    if (id.endsWith(WILD) && node.id.startsWith(id.slice(0, -1))) return true;
    return node.id.endsWith(WILD) && id.startsWith(node.id.slice(0, -1));
}

export function parse(children: ReactNode, parentPath = ""): MenuNode[] {
    return flatten(children).map(el => {
        const type = typeName(el);
        if (type === "group") return { kind: "group", type, label: "", el, children: parse(el.props.children, parentPath) };
        const { id } = el.props;
        if (!id) return { kind: "opaque", type, label: textOf(el.props.label), el };
        const path = joinPath(parentPath, id);
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

function resolveAll(map: Map<string, Entry>, key: string): Entry[] {
    const exact = map.get(key);
    if (exact) return [exact];
    const all = [...map.values()].filter(e => keyMatches(key, e.node));
    return key.endsWith(WILD) ? all : all.slice(0, 1);
}

const resolve = (map: Map<string, Entry>, key: string) => resolveAll(map, key)[0];

function detach(entry: Entry) {
    const i = entry.parent.indexOf(entry.node);
    if (i !== -1) entry.parent.splice(i, 1);
}

function forgetSubtree(map: Map<string, Entry>, path: string) {
    for (const key of [...map.keys()]) if (key === path || key.startsWith(path + SEP)) map.delete(key);
}

function containsList(node: MenuNode, list: MenuNode[]): boolean {
    return !!node.children && (node.children === list || node.children.some(c => containsList(c, list)));
}

function levelHas(list: MenuNode[], id: string, except: MenuNode): boolean {
    return list.some(n => n.kind === "group" ? levelHas(n.children ?? [], id, except) : n !== except && n.id === id);
}

const hasLeaves = (nodes: MenuNode[]): boolean => nodes.some(n => n.kind !== "group" || hasLeaves(n.children ?? []));

function levelEntries(list: MenuNode[], out: Array<{ node: MenuNode; parent: MenuNode[]; }> = []) {
    for (const node of list) {
        if (node.kind === "group") levelEntries(node.children ?? [], out);
        else out.push({ node, parent: list });
    }
    return out;
}

const iconOf = (node: MenuNode) => node.override?.icon ?? node.el?.props.icon;

function mergeDuplicates(list: MenuNode[]) {
    const kept: MenuNode[] = [];
    for (const { node, parent } of levelEntries(list)) {
        if (node.kind !== "submenu" || !node.children) continue;
        const target = kept.find(k => k.label === node.label && iconOf(k) === iconOf(node));
        if (!target?.children) {
            kept.push(node);
            continue;
        }
        for (const child of node.children)
            if (!child.id || !levelHas(target.children, child.id, child)) target.children.push(child);
        parent.splice(parent.indexOf(node), 1);
    }
    for (const node of kept) mergeDuplicates(node.children ?? []);
}

export function applyLayout(root: MenuNode[], layout: MenuLayout, mergeSubmenus = false): MenuNode[] {
    const map = index(root, "", new Map());

    for (const key of layout.hidden) {
        for (const entry of resolveAll(map, key)) {
            detach(entry);
            forgetSubtree(map, entry.node.path ?? "");
        }
    }

    const containerOf = (into: string, member: Entry): { list: MenuNode[]; container: string; } | null => {
        if (!into) return { list: root, container: "" };
        const existing = resolve(map, into);
        if (existing) return existing.node.children ? { list: existing.node.children, container: existing.node.path ?? into } : null;
        const submenu = layout.submenus[into];
        if (!submenu) return null;
        const node: MenuNode = { kind: "submenu", type: "submenu", label: submenu.label, id: into, path: into, children: [], synthetic: true };
        member.parent.splice(member.parent.indexOf(member.node), 0, node);
        map.set(into, { node, parent: member.parent, container: member.container });
        return { list: node.children ?? [], container: into };
    };

    for (const move of layout.moves) {
        for (const entry of resolveAll(map, move.item)) {
            const target = containerOf(move.into, entry);
            if (!target || containsList(entry.node, target.list)) continue;
            if (entry.node.id && levelHas(target.list, entry.node.id, entry.node)) continue;
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
    }

    for (const [key, override] of Object.entries(layout.overrides)) {
        for (const { node } of resolveAll(map, key)) {
            node.override = { ...node.override, ...override };
            if (override.label) node.label = override.label;
        }
    }

    if (mergeSubmenus) mergeDuplicates(root);

    const prune = (nodes: MenuNode[]) => {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (node.children) prune(node.children);
            if (node.type !== "submenu" || hasLeaves(node.children ?? [])) continue;
            if (node.el?.props.action) Object.assign(node, { kind: "item", type: "item", children: undefined, emptied: true });
            else nodes.splice(i, 1);
        }
    };
    prune(root);
    tidySeparators(root);
    return root;
}

const hasItems = (nodes: MenuNode[]): boolean => nodes.some(n => n.type !== "separator" && (n.type !== "group" || hasItems(n.children ?? [])));

function tidySeparators(nodes: MenuNode[]) {
    for (const node of nodes) if (node.children) tidySeparators(node.children);
    for (let i = nodes.length - 1; i >= 0; i--)
        if (nodes[i].type === "group" && !hasItems(nodes[i].children ?? [])) nodes.splice(i, 1);
    const breaks = (node?: MenuNode) => !node || node.type === "separator" || node.type === "group";
    for (let i = nodes.length - 1; i >= 0; i--)
        if (nodes[i].type === "separator" && (breaks(nodes[i - 1]) || breaks(nodes[i + 1]))) nodes.splice(i, 1);
}

function toElements(nodes: MenuNode[]): ReactNode[] {
    return nodes.map(node => {
        const children = node.children && toElements(node.children);
        if (node.synthetic) return React.createElement(Menu.MenuItem, { key: node.id, id: node.id ?? "", label: node.label }, children);
        const { el } = node;
        if (!el) return null;
        const props: ItemProps = { ...el.props };
        if (children) props.children = children;
        else if (node.emptied) delete props.children;
        if (node.override) applyOverride(props, node.override, overridableFields(node.type));
        return { ...el, props };
    });
}

function applyOverride(props: ItemProps, override: ItemOverride, fields: Array<keyof ItemOverride>) {
    if (fields.includes("label") && override.label) props.label = override.label;
    if (fields.includes("subtext") && override.subtext) props.subtext = override.subtext;
    if (fields.includes("color") && override.color) props.color = override.color;
    if (fields.includes("disabled") && override.disabled !== undefined) props.disabled = override.disabled;
    if (fields.includes("icon") && override.icon) {
        const icon = resolveIcon(override.icon);
        if (icon === null) {
            delete props.icon;
            delete props.leadingAccessory;
        } else if (icon) props.icon = icon;
    }
}

function normaliseId(id: string) {
    const match = PATTERNS.dynamicId.exec(id);
    return match ? { id: id.slice(0, match.index) + WILD, dynamic: true } : { id, dynamic: false };
}

interface Budget { left: number; }

function toRecorded(nodes: Array<MenuNode | RecordedNode>, parentPath: string, budget: Budget, seen = new Set<string>(), count = { n: 0 }): RecordedNode[] {
    const out: RecordedNode[] = [];
    for (const node of nodes) {
        if (budget.left <= 0 || count.n >= PATTERNS.maxChildrenPerLevel) break;
        if (node.kind === "group") {
            budget.left--;
            const children = toRecorded(node.children ?? [], parentPath, budget, seen, count);
            if (children.length) out.push({ kind: "group", type: "group", label: "", children });
            continue;
        }
        if (!node.id) {
            budget.left--;
            count.n++;
            out.push({ kind: node.kind, type: node.type, label: node.label });
            continue;
        }
        const { id, dynamic } = normaliseId(node.id);
        const path = joinPath(parentPath, id);
        if (seen.has(path)) continue;
        seen.add(path);
        budget.left--;
        count.n++;
        const rec: RecordedNode = { kind: node.kind, type: node.type, label: dynamic ? id : node.label, id, path };
        if (node.children) rec.children = toRecorded(node.children, path, budget);
        out.push(rec);
    }
    return out;
}

const capped = (nodes: Array<MenuNode | RecordedNode>) => toRecorded(nodes, "", { left: PATTERNS.maxNodesPerMenu });

const signature = (nodes: MenuNode[]): string =>
    nodes.map(n => (n.id ?? n.kind) + (n.children ? `[${signature(n.children)}]` : "")).join(",");

function byPath(nodes: RecordedNode[], into = new Map<string, RecordedNode>()) {
    for (const n of nodes) {
        if (n.path) into.set(n.path, n);
        if (n.children) byPath(n.children, into);
    }
    return into;
}

function merge(fresh: RecordedNode[], old: RecordedNode[] | undefined): RecordedNode[] {
    if (!old) return fresh;
    const known = byPath(fresh);
    const atRoot: RecordedNode[] = [];
    const collect = (nodes: RecordedNode[]) => nodes.forEach(n => {
        if (n.kind === "group") return n.children && collect(n.children);
        if (!n.path) return;
        if (known.has(n.path)) return n.children && collect(n.children);
        const parent = known.get(parentOf(n.path));
        if (parent?.children) parent.children.push(n);
        else atRoot.push(n);
    });
    collect(old);
    return capped(atRoot.length ? [...fresh, { kind: "group", type: "group", label: "", children: atRoot }] : fresh);
}

let recorded: Record<string, RecordedNode[]> = {};
const signatures = new Map<string, string>();
const failedMenus = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

const saveRecording = proxyLazy(() => lodash.debounce(() => {
    DataStore.set(PATTERNS.recordingKey, recorded).catch(e => logger.error("Saving the seen menus failed.", e));
}, PATTERNS.recordingSaveDelay));

export async function loadRecording() {
    const stored = await DataStore.get<Record<string, RecordedNode[]>>(PATTERNS.recordingKey) ?? {};
    const migrated = lodash.mapValues(stored, capped);
    recorded = { ...migrated, ...recorded };
    if (!lodash.isEqual(migrated, stored)) saveRecording();
    notify();
}

export function stopRecording() {
    saveRecording.flush();
    signatures.clear();
    failedMenus.clear();
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
    notify();
}

export function record(navId: string, nodes: MenuNode[]) {
    const sig = signature(nodes);
    if (signatures.get(navId) === sig) return;
    signatures.set(navId, sig);
    recorded = { ...recorded, [navId]: merge(capped(nodes), recorded[navId]) };
    saveRecording();
    notify();
}

export function transform(children: ReactNode, navId: string, layout: MenuLayout | undefined, extra: ReactNode, mergeSubmenus: boolean): ReactNode {
    if (!navId || !Menu.MenuItem) return children;
    try {
        const nodes = parse(children);
        record(navId, nodes);
        if (!layout && !mergeSubmenus) return extra ? [children, extra] : children;
        const out = toElements(applyLayout(nodes, layout ?? emptyLayout(), mergeSubmenus));
        return extra ? [...out, extra] : out;
    } catch (e) {
        if (!failedMenus.has(navId)) {
            failedMenus.add(navId);
            logger.error(`Customising ${navId} failed, showing it unchanged.`, e);
        }
        return extra ? [children, extra] : children;
    }
}
