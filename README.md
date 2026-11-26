# MenuCustomisation

Equicord user plugin: hide, rename, reorder and group the items of any right-click menu, including Discord's own items and the ones other plugins add (channel, user, server, message menus, the Equicord toolbox and every other menu).

## How it works

The plugin hooks Discord's menu component right where it reads its items, after every other plugin has added theirs, so it sees the finished menu.

- Every menu you open is remembered locally (item ids, types and labels), so the editor can list its items. This list never leaves your computer and is not part of settings sync.
- Your rules are stored in the plugin's settings.
- Open the editor from the plugin settings, or with **Customise this menu…** at the end of any menu (can be turned off).

In the editor you can:

- hide an item,
- give it a different label,
- drag it to another position,
- put it into a submenu of the menu, or into a new submenu you create.

Rules match an item by its full path first (submenu ids and its own id, joined with `/`), then by its own id anywhere in the menu, so they keep working when an item moves between submenus. A rule key ending in `*` matches every id that starts with the rest.

## Limits

- Items without an id (separators, groups, some custom items) can't be customised.
- Sliders and custom-rendered items can be hidden or moved, but not renamed.
- Renaming an item with a styled label replaces it with plain text.
- A menu has to be opened once before it shows up in the editor.

## Example

Rules for the channel menu (`channel-context`), as stored in the settings:

```json
{
  "hidden": ["join-muted-custom-join-sound"],
  "renames": {},
  "submenus": { "vc-mc-sub-jump": { "label": "Jump to…" } },
  "moves": [
    { "item": "vc-jump-to-first", "into": "vc-mc-sub-jump" },
    { "item": "vc-jump-to-last", "into": "vc-mc-sub-jump" },
    { "item": "LastActive", "into": "vc-mc-sub-jump" }
  ]
}
```

This hides Discord's "Join Without Entrance Sound" and puts the items of JumpTo and LastActive into one "Jump to…" submenu.

## Install

```sh
cd src/userplugins
git clone https://github.com/bluscream-vencord-plugins/menuCustomisation
```

Rebuild Equicord, enable MenuCustomisation and restart Discord. Update with `git pull`.
