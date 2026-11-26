# MenuCustomisation

Equicord user plugin: hide, restyle, reorder and group the items of any right-click menu, including Discord's own items and the ones other plugins add (channel, user, server, message menus, the Equicord toolbox and every other menu).

## How it works

The plugin hooks Discord's menu component right where it reads its items, after every other plugin has added theirs, so it sees the finished menu.

- Every menu you open is remembered locally, so the editor can list its items. This list never leaves your computer and is not part of settings sync.
- Ids that contain a Discord id (users, channels, roles, servers…) are remembered as a wildcard, e.g. `devmode-copy-id-*`, without a label. Each menu keeps at most 500 items and 50 per level.
- Your rules are stored in the plugin's settings.
- Open the editor from the plugin settings, or with **Customise this menu…** at the end of any menu (can be turned off in the settings).

In the editor you can, per item:

- hide it,
- change its label and subtext,
- change its colour (default, brand, danger, premium, success),
- change its icon: none, one of Equicord's icons, or an image from an `https://` address,
- disable it (shown greyed out),
- drag it to another position, or put it into a submenu of the menu or into a new submenu you create.

Checkboxes and radio items only support label, subtext and disabled. Sliders and custom-rendered items can only be hidden or moved.

Rules match an item by its full path first (its submenu ids and its own id), then by its own id anywhere in the menu, so they keep working when an item moves between submenus. A rule key ending in `*` matches every id that starts with the rest, so a rule made on a wildcard item applies to all of them.

## Tray menu

With the optional [NativeUtils](https://github.com/bluscream-vencord-plugins/nativeUtils) plugin installed and enabled, Equibop's tray menu can be customised too. It shows up as the **tray** menu in the editor, with Equibop's own items and items other plugins add (like [BetterTrayMenu](https://github.com/bluscream-vencord-plugins/betterTrayMenu)). You can hide, disable (grey out), rename and move them and put them into submenus; subtext, colours and icons aren't available there. The tray also gets a **Customise menus…** item that opens the editor on it.

The tray layout is sent to NativeUtils every few seconds and right after you change it. NativeUtils' tray hook only loads on startup, so after installing or updating it, restart Discord fully once. On Linux, submenus show as their items between separators. Without NativeUtils, everything else works the same.

## Limits

- Items without an id (separators, groups, some custom items) can't be customised.
- Changing the label of an item with a styled label replaces it with plain text.
- A menu has to be opened once before it shows up in the editor.

## Example

Rules for the channel menu (`channel-context`), as stored in the settings:

```json
{
  "hidden": ["join-muted-custom-join-sound"],
  "overrides": { "vc-ml-clear-channel": { "color": "default", "icon": "Delete" } },
  "submenus": { "vc-mc-sub-jump": { "label": "Jump to…" } },
  "moves": [
    { "item": "vc-jump-to-first", "into": "vc-mc-sub-jump" },
    { "item": "vc-jump-to-last", "into": "vc-mc-sub-jump" },
    { "item": "LastActive", "into": "vc-mc-sub-jump" }
  ]
}
```

This hides Discord's "Join Without Entrance Sound", shows MessageLogger's "Clear Message Log" in the normal colour with a bin icon, and puts the items of JumpTo and LastActive into one "Jump to…" submenu.

## Install

```sh
cd src/userplugins
git clone https://github.com/bluscream-vencord-plugins/menuCustomisation
```

Rebuild Equicord, enable MenuCustomisation and restart Discord. Update with `git pull`.
