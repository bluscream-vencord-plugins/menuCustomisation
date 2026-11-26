/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    ClockIcon, CogWheel, CopyIcon, DeleteIcon, EyeIcon, EyeSlashIcon, FolderIcon, HeadphonesIcon, IDIcon, ImageIcon, InfoIcon,
    LinkIcon, LogIcon, MagnifyingGlassIcon, Microphone, NotesIcon, OpenExternalIcon, PencilIcon, PlusIcon, ReplyIcon, ResetIcon,
    RobotIcon, ShieldIcon, StarFilled, UserIcon, VideoIcon, WarningIcon
} from "@components/Icons";
import { parseUrl } from "@utils/misc";
import { React } from "@webpack/common";
import type { ComponentType } from "react";

import { PATTERNS } from "./patterns";

type IconComponent = ComponentType<{ className?: string; }>;

export const ICONS: Record<string, IconComponent> = {
    Clock: ClockIcon,
    Copy: CopyIcon,
    Delete: DeleteIcon,
    Eye: EyeIcon,
    "Eye Slash": EyeSlashIcon,
    Folder: FolderIcon,
    Headphones: HeadphonesIcon,
    ID: IDIcon,
    Image: ImageIcon,
    Info: InfoIcon,
    Link: LinkIcon,
    Log: LogIcon,
    Microphone,
    Notes: NotesIcon,
    "Open External": OpenExternalIcon,
    Pencil: PencilIcon,
    Plus: PlusIcon,
    Reply: ReplyIcon,
    Reset: ResetIcon,
    Robot: RobotIcon,
    Search: MagnifyingGlassIcon,
    Settings: CogWheel,
    Shield: ShieldIcon,
    Star: StarFilled,
    User: UserIcon,
    Video: VideoIcon,
    Warning: WarningIcon
};

export const isImageUrl = (value: string) => parseUrl(value)?.protocol === PATTERNS.imageUrlProtocol;

const urlIcons = new Map<string, IconComponent>();

function urlIcon(url: string): IconComponent {
    let icon = urlIcons.get(url);
    if (!icon) {
        icon = ({ className }) => React.createElement("img", { src: url, className, width: 18, height: 18, alt: "" });
        urlIcons.set(url, icon);
    }
    return icon;
}

export function resolveIcon(value: string): IconComponent | null | undefined {
    if (value === PATTERNS.iconNone) return null;
    if (isImageUrl(value)) return urlIcon(value);
    return ICONS[value];
}
