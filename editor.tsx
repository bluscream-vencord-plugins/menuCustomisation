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
import { lodash, Modal, openModal, React, Select, TextInput, useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { ICONS, isImageUrl } from "./icons";
import { PATTERNS } from "./patterns";
import {
    applyLayout, displayPath, forgetRecording, getRecorded, isEmptyLayout, ItemOverride, keyMatches, MenuLayout, MenuNode, Move,
    normaliseLayout, overridableFields, RecordedNode, subscribeRecording
} from "./transform";

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

const KEEP = PATTERNS.keepPlace;

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
    moveTo(move: Move): void;
}

const lastMoveOf = (layout: MenuLayout, node: MenuNode) => layout.moves.findLast(m => keyMatches(m.item, node));
const overrideOf = (layout: MenuLayout, node: MenuNode): ItemOverride =>
    Object.assign({}, ...Object.entries(layout.overrides).filter(([k]) => keyMatches(k, node)).map(([, o]) => o));
const isHidden = (layout: MenuLayout, node: MenuNode) => layout.hidden.some(k => keyMatches(k, node));

function descendantPaths(node: MenuNode, into = new Set<string>()) {
    for (const child of node.children ?? []) {
        if (child.path) into.add(child.path);
        descendantPaths(child, into);
    }
    return into;
}

function ItemForm({ row, layout, original, targets, save, moveTo }: ItemFormProps) {
    const { node } = row;
    const [urlMode, setUrlMode] = useState(false);
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

    const move = lastMoveOf(layout, node);
    const inside = descendantPaths(node);
    const fields = overridableFields(node.type);
    const override = overrideOf(layout, node);
    const setInto = (value: string) => value === KEEP
        ? save({ ...layout, moves: layout.moves.filter(m => !keyMatches(m.item, node)) })
        : moveTo({ item: key, into: value });
    const setOverride = (patch: ItemOverride) => {
        const others = lodash.pickBy(layout.overrides, (_, k) => !keyMatches(k, node));
        const next = lodash.pickBy({ ...override, ...patch }, v => v !== undefined && v !== "" && v !== false);
        save({ ...layout, overrides: lodash.isEmpty(next) ? others : { ...others, [key]: next } });
    };
    const iconChoice = urlMode || (override.icon && isImageUrl(override.icon)) ? PATTERNS.iconUrlChoice : override.icon ?? KEEP;
    const selectIcon = (value: string) => {
        setUrlMode(value === PATTERNS.iconUrlChoice);
        if (value !== PATTERNS.iconUrlChoice) setOverride({ icon: value === KEEP ? undefined : value });
    };

    return (
        <div className={cl("form")}>
            {fields.includes("label") && <Field label="Label" wide>
                <Input value={override.label ?? ""} placeholder={original?.label ?? node.label} onCommit={label => setOverride({ label })} />
            </Field>}
            {fields.includes("subtext") && <Field label="Subtext" wide>
                <Input value={override.subtext ?? ""} placeholder="None" onCommit={subtext => setOverride({ subtext })} />
            </Field>}
            <Field label="Put into">
                <Select
                    options={[{ label: "Where it was", value: KEEP }, ...targets.filter(t => t.value !== key && !inside.has(t.value))]}
                    isSelected={v => v === (move?.into ?? KEEP)}
                    select={setInto}
                    serialize={v => v}
                />
            </Field>
            {fields.includes("color") && <Field label="Colour">
                <Select
                    options={[{ label: "Unchanged", value: KEEP }, ...PATTERNS.colors.map(c => ({ label: lodash.capitalize(c), value: c }))]}
                    isSelected={v => v === (override.color ?? KEEP)}
                    select={v => setOverride({ color: v === KEEP ? undefined : v })}
                    serialize={v => v}
                />
            </Field>}
            {fields.includes("icon") && <Field label="Icon">
                <Select
                    options={[
                        { label: "Unchanged", value: KEEP },
                        { label: "No icon", value: PATTERNS.iconNone },
                        ...Object.keys(ICONS).map(name => ({ label: name, value: name })),
                        { label: "Image address…", value: PATTERNS.iconUrlChoice }
                    ]}
                    isSelected={v => v === iconChoice}
                    select={selectIcon}
                    serialize={v => v}
                />
            </Field>}
            {fields.includes("icon") && iconChoice === PATTERNS.iconUrlChoice && <Field label="Image address" wide>
                <Input
                    value={override.icon && isImageUrl(override.icon) ? override.icon : ""}
                    placeholder="https://…"
                    onCommit={url => setOverride({ icon: isImageUrl(url) ? url : undefined })}
                />
            </Field>}
            <div className={cl("switches")}>
                <Field label="Hidden">
                    <Switch
                        checked={isHidden(layout, node)}
                        onChange={hide => save({ ...layout, hidden: hide ? [...layout.hidden, key] : layout.hidden.filter(k => !keyMatches(k, node)) })}
                    />
                </Field>
                {fields.includes("disabled") && <Field label="Disabled">
                    <Switch checked={!!override.disabled} onChange={disabled => setOverride({ disabled })} />
                </Field>}
            </div>
        </div>
    );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode; }) {
    return (
        <div className={cl("field", { "field-wide": wide })}>
            <Span weight="medium" size="sm">{label}</Span>
            {children}
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

const OVERRIDE_BADGES: Record<string, string> = {
    label: "Renamed",
    subtext: "Subtext",
    color: "Colour",
    icon: "Icon",
    disabled: "Disabled"
};

function badges(row: Row, layout: MenuLayout) {
    const { node } = row;
    return [
        node.synthetic ? "New submenu" : node.type,
        isHidden(layout, node) && "Hidden",
        ...Object.keys(overrideOf(layout, node)).map(f => OVERRIDE_BADGES[f]),
        lastMoveOf(layout, node) && "Moved"
    ].filter(Boolean).join(" · ");
}

function rowKeys(rows: Row[]) {
    const counters = new Map<string, number>();
    return rows.map(row => {
        if (row.node.path) return row.node.path;
        const n = counters.get(row.container) ?? 0;
        counters.set(row.container, n + 1);
        return `${row.container}${PATTERNS.pathSeparator}#${n}`;
    });
}

function LayoutEditor({ initialNavId }: { initialNavId?: string; }) {
    const layouts = settings.use(LAYOUT_KEYS).layouts ?? {};
    const recorded = useRecorded();
    const navIds = [...new Set([...Object.keys(recorded), ...Object.keys(layouts)])].filter(Boolean).sort();
    const [chosen, setNavId] = useState(initialNavId ?? "");
    const navId = navIds.includes(chosen) ? chosen : navIds[0] ?? "";
    const [dragged, setDragged] = useState<number | null>(null);
    const [drop, setDrop] = useState<Drop | null>(null);
    const [newLabel, setNewLabel] = useState("");

    const stored = layouts[navId];
    const layout = useMemo(() => normaliseLayout(stored), [stored]);
    const original = recorded[navId] ?? [];
    const known = useMemo(() => recordedPaths(original), [original]);
    const rows = useMemo(() => toRows(applyLayout(lodash.cloneDeep(original), { ...layout, hidden: [] })), [original, layout]);

    if (!navId) return <Paragraph>No menus seen yet. Open a few right-click menus, then come back.</Paragraph>;

    const save = (next: MenuLayout) => {
        const { [navId]: _, ...rest } = layouts;
        settings.store.layouts = lodash.cloneDeep(isEmptyLayout(next) ? rest : { ...rest, [navId]: next });
    };
    const keys = rowKeys(rows);
    const shown = new Set(rows.map(r => r.node.path));
    const targets = [
        { label: "Top level", value: "" },
        ...Object.entries(layout.submenus).map(([id, s]) => ({ label: `${s.label} (new)`, value: id })),
        ...[...known.values()].filter(n => n.kind === "submenu").map(n => ({ label: n.label, value: n.path ?? "" }))
    ];
    const knownNodes = [...known.values()];
    const unseen = [...new Set([...layout.hidden, ...Object.keys(layout.overrides), ...layout.moves.map(m => m.item)])]
        .filter(k => !layout.submenus[k] && !knownNodes.some(n => keyMatches(k, n)));
    const orphanSubmenus = Object.entries(layout.submenus).filter(([id]) => !shown.has(id));

    const moveTo = (move: Move) => {
        const last = layout.moves.at(-1);
        const moves = last?.item === move.item ? layout.moves.slice(0, -1) : layout.moves;
        save({ ...layout, moves: [...moves, move] });
    };
    const removeKey = (key: string) => save({
        ...layout,
        hidden: layout.hidden.filter(k => k !== key),
        overrides: lodash.omit(layout.overrides, key),
        moves: layout.moves.filter(m => m.item !== key)
    });

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
        if (target && source !== target && source.node.path && target.node.path && !descendantPaths(source.node).has(target.node.path) && target.container !== source.node.path)
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
                        key={keys[index]}
                        className={cl("row", { "row-dragging": dragged === index, "row-group": row.groupStart })}
                        style={{ marginLeft: `${row.depth * 1.5}em` }}
                        onDragOver={onDragOver(index)}
                        onDrop={onDrop}
                    >
                        {drop?.index === index && <div className={cl("drop", drop.after ? "drop-after" : "drop-before")} />}
                        {row.node.path
                            ? <ItemCard row={row} layout={layout} original={known.get(row.node.path)} targets={targets} save={save} moveTo={moveTo}>
                                <div
                                    className={cl("header")}
                                    draggable
                                    onDragStart={e => { setDragged(index); e.dataTransfer.setData("text/plain", String(index)); }}
                                    onDragEnd={() => { setDragged(null); setDrop(null); }}
                                >
                                    <Paragraph weight="medium" size="md">{row.node.label}</Paragraph>
                                    <Paragraph size="sm">{badges(row, layout)} · {displayPath(row.node.path)}</Paragraph>
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
                            <Paragraph size="md">{knownNodes.find(n => keyMatches(key, n))?.label ?? displayPath(key)}</Paragraph>
                            <Button size="small" onClick={() => save({ ...layout, hidden: layout.hidden.filter(k => k !== key) })}>Show</Button>
                        </Flex>
                    ))}
                </Flex>
            </>}

            <Heading className={classes(Margins.top20, Margins.bottom8)}>Submenus</Heading>
            <Paragraph className={Margins.bottom8}>A new submenu shows up once you put an item into it.</Paragraph>
            <Flex flexDirection="column" gap="0.5em">
                {orphanSubmenus.map(([id, s]) => (
                    <Flex key={id} className={cl("line")} alignItems="center" justifyContent="space-between">
                        <Paragraph size="md">{s.label} (not shown, nothing seen is in it)</Paragraph>
                        <Button size="small" variant="dangerPrimary" onClick={() => {
                            const { [id]: _, ...submenus } = layout.submenus;
                            save({ ...layout, submenus, moves: layout.moves.filter(m => m.into !== id && m.item !== id) });
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
                            <Paragraph size="md">{displayPath(key)}</Paragraph>
                            <Button size="small" variant="dangerPrimary" onClick={() => removeKey(key)}>Remove Rules</Button>
                        </Flex>
                    ))}
                </Flex>
            </>}

            <Flex className={Margins.top20} gap="0.5em">
                <Button variant="dangerPrimary" onClick={() => {
                    const { [navId]: _, ...rest } = layouts;
                    settings.store.layouts = lodash.cloneDeep(rest);
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
