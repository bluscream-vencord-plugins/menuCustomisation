/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { ExpandableSection } from "@components/ExpandableCard";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Margins } from "@components/margins";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { Switch } from "@components/Switch";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { OptionType } from "@utils/types";
import { lodash, Modal, openModal, React, Select, TextInput, useCallback, useEffect, useRef, useState } from "@webpack/common";

import { PATTERNS } from "./patterns";
import { applyLayout, emptyLayout, forgetRecording, getRecorded, MenuLayout, MenuNode, Move, RecordedNode, subscribeRecording } from "./transform";

const cl = classNameFactory("vc-menu-customisation-");

export const settings = definePluginSettings({
    customiseItem: {
        type: OptionType.BOOLEAN,
        description: "Add a \"Customise this menu…\" item at the end of every menu.",
        default: true
    },
    editor: {
        type: OptionType.COMPONENT,
        component: ErrorBoundary.wrap(() => <LayoutEditor />, { noop: true })
    }
}).withPrivateSettings<{ layouts?: Record<string, MenuLayout>; }>();

const LAYOUT_KEYS: ["layouts"] = ["layouts"];

const KEEP = "\u0000keep";

function Input({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit(value: string): void; }) {
    const [draft, setDraft] = useState(value);
    const latest = useRef({ draft, value, onCommit });
    latest.current = { draft, value, onCommit };

    useEffect(() => setDraft(value), [value]);
    useEffect(() => () => {
        const { draft, value, onCommit } = latest.current;
        if (draft !== value) onCommit(draft);
    }, []);

    const commit = () => {
        if (draft !== value) onCommit(draft);
        setDraft(value);
    };

    return (
        <TextInput
            value={draft}
            placeholder={placeholder}
            onChange={setDraft}
            onBlur={commit}
            onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && commit()}
        />
    );
}

interface Row {
    node: MenuNode;
    depth: number;
    container: string;
    groupStart: boolean;
}

function toRows(nodes: MenuNode[], depth = 0, container = "", rows: Row[] = [], groupStart = false): Row[] {
    nodes.forEach((node, i) => {
        if (node.kind === "group") {
            toRows(node.children ?? [], depth, container, rows, rows.length > 0);
            return;
        }
        rows.push({ node, depth, container, groupStart: groupStart && i === 0 });
        if (node.children) toRows(node.children, depth + 1, node.path ?? node.id ?? "", rows);
    });
    return rows;
}

function recordedPaths(nodes: RecordedNode[], into = new Map<string, RecordedNode>()) {
    for (const n of nodes) {
        if (n.path) into.set(n.path, n);
        if (n.children) recordedPaths(n.children, into);
    }
    return into;
}

function useRecorded() {
    const [recorded, setRecorded] = useState(getRecorded);
    useEffect(() => subscribeRecording(() => setRecorded(getRecorded())), []);
    return recorded;
}

interface ItemFormProps {
    row: Row;
    layout: MenuLayout;
    original?: RecordedNode;
    targets: { label: string; value: string; }[];
    save(layout: MenuLayout): void;
}

function ItemForm({ row, layout, original, targets, save }: ItemFormProps) {
    const { node } = row;
    const key = node.path ?? node.id ?? "";

    if (node.synthetic) {
        return (
            <>
                <div className={cl("grid")}>
                    <Span weight="medium" size="md">Label</Span>
                    <Input value={node.label} placeholder="Submenu" onCommit={label => label && save({ ...layout, submenus: { ...layout.submenus, [key]: { label } } })} />
                </div>
                <Button className={cl("delete")} variant="dangerPrimary" onClick={() => {
                    const { [key]: _, ...submenus } = layout.submenus;
                    save({ ...layout, submenus, moves: layout.moves.filter(m => m.into !== key && m.item !== key) });
                }}>Delete Submenu</Button>
            </>
        );
    }

    const move = layout.moves.find(m => m.item === key);
    const setInto = (value: string) => {
        const moves = layout.moves.filter(m => m.item !== key);
        save({ ...layout, moves: value === KEEP ? moves : [...moves, { item: key, into: value }] });
    };

    return (
        <div className={cl("grid")}>
            <Span weight="medium" size="md">Label</Span>
            <Input
                value={layout.renames[key] ?? ""}
                placeholder={original?.label ?? node.label}
                onCommit={label => {
                    const { [key]: _, ...renames } = layout.renames;
                    save({ ...layout, renames: label ? { ...renames, [key]: label } : renames });
                }}
            />
            <Span weight="medium" size="md">Hidden</Span>
            <Switch checked={false} onChange={hide => hide && save({ ...layout, hidden: [...layout.hidden, key] })} />
            <Span weight="medium" size="md">Put into</Span>
            <Select
                options={[{ label: "Where it was", value: KEEP }, ...targets.filter(t => t.value !== key)]}
                isSelected={v => v === (move?.into ?? KEEP)}
                select={setInto}
                serialize={v => v}
            />
        </div>
    );
}

function ItemCard({ children, ...form }: ItemFormProps & { children: React.ReactNode; }) {
    const latest = useRef(form);
    latest.current = form;
    const Content = useCallback(() => <ItemForm {...latest.current} />, []);
    return <ExpandableSection renderContent={Content}>{children}</ExpandableSection>;
}

interface Drop { index: number; after: boolean; }

function badges(row: Row, layout: MenuLayout) {
    const key = row.node.path ?? "";
    return [
        row.node.synthetic ? "New submenu" : row.node.type,
        layout.renames[key] && "Renamed",
        layout.moves.some(m => m.item === key) && "Moved"
    ].filter(Boolean).join(" · ");
}

function LayoutEditor({ initialNavId }: { initialNavId?: string; }) {
    const layouts = settings.use(LAYOUT_KEYS).layouts ?? {};
    const recorded = useRecorded();
    const navIds = [...new Set([...Object.keys(recorded), ...Object.keys(layouts)])].sort();
    const [navId, setNavId] = useState(initialNavId ?? navIds[0] ?? "");
    const [dragged, setDragged] = useState<number | null>(null);
    const [drop, setDrop] = useState<Drop | null>(null);
    const [newLabel, setNewLabel] = useState("");

    if (!navIds.length) return <Paragraph>No menus seen yet. Open a few right-click menus, then come back.</Paragraph>;

    const layout = layouts[navId] ?? emptyLayout();
    const save = (next: MenuLayout) => settings.store.layouts = { ...layouts, [navId]: next };
    const original = recorded[navId] ?? [];
    const known = recordedPaths(original);
    const preview: MenuNode[] = applyLayout(lodash.cloneDeep(original), layout);
    const rows = toRows(preview);
    const targets = [
        { label: "Top level", value: "" },
        ...Object.entries(layout.submenus).map(([id, s]) => ({ label: `${s.label} (new)`, value: id })),
        ...[...known.values()].filter(n => n.kind === "submenu").map(n => ({ label: n.label, value: n.path ?? "" }))
    ];
    const unseen = [...new Set([...layout.hidden, ...Object.keys(layout.renames), ...layout.moves.map(m => m.item)])]
        .filter(k => !known.has(k) && !layout.submenus[k]);
    const placed = new Set(layout.moves.map(m => m.into));
    const emptySubmenus = Object.entries(layout.submenus).filter(([id]) => !placed.has(id));

    const moveTo = (move: Move) => save({ ...layout, moves: [...layout.moves.filter(m => m.item !== move.item), move] });
    const removeKey = (key: string) => {
        const { [key]: _, ...renames } = layout.renames;
        save({ ...layout, hidden: layout.hidden.filter(k => k !== key), renames, moves: layout.moves.filter(m => m.item !== key) });
    };

    const onDragOver = (index: number) => (e: React.DragEvent) => {
        if (dragged === null) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const after = e.clientY - rect.top > rect.height / 2;
        if (drop?.index !== index || drop.after !== after) setDrop({ index, after });
    };
    const onDrop = (e: React.DragEvent) => {
        if (dragged === null) return;
        e.preventDefault();
        const source = rows[dragged];
        const target = drop && rows[drop.index];
        if (target && source !== target && source.node.path && target.node.path)
            moveTo({ item: source.node.path, into: target.container, anchor: target.node.path, before: !drop.after });
        setDragged(null);
        setDrop(null);
    };

    return (
        <section>
            <Heading className={Margins.bottom8}>Menu Layouts</Heading>
            <Paragraph className={Margins.bottom16}>
                Pick a menu you've opened before, then hide, rename or move its items. Drag items to reorder them, or put them into a submenu.
            </Paragraph>
            <Select
                className={Margins.bottom16}
                options={navIds.map(id => ({ label: id, value: id }))}
                isSelected={v => v === navId}
                select={setNavId}
                serialize={v => v}
            />

            <Flex flexDirection="column" gap="0.5em">
                {rows.map((row, index) => (
                    <div
                        key={(row.node.path ?? row.node.label) + index}
                        className={cl("row", { "row-dragging": dragged === index, "row-group": row.groupStart })}
                        style={{ marginLeft: `${row.depth * 1.5}em` }}
                        onDragOver={onDragOver(index)}
                        onDrop={onDrop}
                    >
                        {drop?.index === index && <div className={cl("drop", drop.after ? "drop-after" : "drop-before")} />}
                        {row.node.path
                            ? <ItemCard row={row} layout={layout} original={known.get(row.node.path)} targets={targets} save={save}>
                                <div
                                    className={cl("header")}
                                    draggable
                                    onDragStart={e => { setDragged(index); e.dataTransfer.setData("text/plain", String(index)); }}
                                    onDragEnd={() => { setDragged(null); setDrop(null); }}
                                >
                                    <Paragraph weight="medium" size="md">{row.node.label}</Paragraph>
                                    <Paragraph size="sm">{badges(row, layout)} · {row.node.path}</Paragraph>
                                </div>
                            </ItemCard>
                            : <Paragraph size="sm" className={cl("opaque")}>{row.node.label || row.node.type} (no id, can't be customised)</Paragraph>}
                    </div>
                ))}
            </Flex>

            {layout.hidden.length > 0 && <>
                <Heading className={classes(Margins.top20, Margins.bottom8)}>Hidden</Heading>
                <Flex flexDirection="column" gap="0.5em">
                    {layout.hidden.map(key => (
                        <Flex key={key} className={cl("line")} alignItems="center" justifyContent="space-between">
                            <Paragraph size="md">{known.get(key)?.label ?? key}</Paragraph>
                            <Button size="small" onClick={() => save({ ...layout, hidden: layout.hidden.filter(k => k !== key) })}>Show</Button>
                        </Flex>
                    ))}
                </Flex>
            </>}

            <Heading className={classes(Margins.top20, Margins.bottom8)}>Submenus</Heading>
            <Paragraph className={Margins.bottom8}>A new submenu shows up once you put an item into it.</Paragraph>
            <Flex flexDirection="column" gap="0.5em">
                {emptySubmenus.map(([id, s]) => (
                    <Flex key={id} className={cl("line")} alignItems="center" justifyContent="space-between">
                        <Paragraph size="md">{s.label} (empty)</Paragraph>
                        <Button size="small" variant="dangerPrimary" onClick={() => {
                            const { [id]: _, ...submenus } = layout.submenus;
                            save({ ...layout, submenus });
                        }}>Delete</Button>
                    </Flex>
                ))}
                <Flex gap="0.5em" alignItems="center">
                    <div className={cl("grow")}>
                        <TextInput value={newLabel} placeholder="Jump to…" onChange={setNewLabel} />
                    </div>
                    <Button disabled={!newLabel.trim()} onClick={() => {
                        save({ ...layout, submenus: { ...layout.submenus, [PATTERNS.submenuPrefix + Date.now().toString(36)]: { label: newLabel.trim() } } });
                        setNewLabel("");
                    }}>Add Submenu</Button>
                </Flex>
            </Flex>

            {unseen.length > 0 && <>
                <Heading className={classes(Margins.top20, Margins.bottom8)}>Rules for items not seen</Heading>
                <Paragraph className={Margins.bottom8}>These items weren't in this menu the last times it opened. Their rules still apply when they show up.</Paragraph>
                <Flex flexDirection="column" gap="0.5em">
                    {unseen.map(key => (
                        <Flex key={key} className={cl("line", "unseen")} alignItems="center" justifyContent="space-between">
                            <Paragraph size="md">{key}</Paragraph>
                            <Button size="small" variant="dangerPrimary" onClick={() => removeKey(key)}>Remove Rules</Button>
                        </Flex>
                    ))}
                </Flex>
            </>}

            <Flex className={Margins.top20} gap="0.5em">
                <Button variant="dangerPrimary" onClick={() => {
                    const { [navId]: _, ...rest } = layouts;
                    settings.store.layouts = rest;
                }}>Reset This Menu</Button>
                <Button variant="secondary" onClick={() => forgetRecording(navId)}>Forget Seen Items</Button>
            </Flex>
        </section>
    );
}

export function openEditor(navId: string) {
    openModal(props => (
        <ErrorBoundary>
            <Modal {...props} size="lg" title="Customise Menu">
                <div className={cl("modal")}>
                    <LayoutEditor initialNavId={navId} />
                </div>
            </Modal>
        </ErrorBoundary>
    ));
}
