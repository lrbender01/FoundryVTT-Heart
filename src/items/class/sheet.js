import sheetHTML from './sheet.html';
import templateJSON from './template.json';
import HeartItemSheet from '../base/sheet';
import { needsEquipmentPick } from './equipment';
import { heartDialogOptions } from '../../common/dialog';

import './sheet.sass';

const data = Object.freeze({
    type: Object.keys(templateJSON.Item)[0],
    img: 'systems/heart/assets/drum.svg',
    template: sheetHTML.path,
});

export default class extends HeartItemSheet {
    static get type() { return data.type; }

    // Open wide enough to read (was Foundry's 560px item default); slightly
    // narrower than the 1250px character sheet (2026-09-29).
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 1050,
            height: 900,
        });
    }

    get template() {
        return data.template;
    }

    get img() {
        return data.img;
    }

    getData() {
        const data = super.getData();        
        data.coreAbilities = this.item.children.filter(x => x.type === 'ability' && x.system.type === 'core');
        data.minorAbilities = this.item.children.filter(x => x.type === 'ability' && x.system.type === 'minor');
        data.majorAbilities = this.item.children.filter(x => x.type === 'ability' && x.system.type === 'major');
        data.zenithAbilities = this.item.children.filter(x => x.type === 'ability' && x.system.type === 'zenith');

        // Equipment choices (2026-09-29 review): "core" is "You get"; every
        // other group is one option of a pick-one choice, clustered by name
        // prefix ("group_1..3" -> one choice; Blightborn's "weapon_*" and
        // "kit_*" -> two). Each choice renders as ONE section of options.
        const groups = this.item.system.equipment_groups ?? [];
        const active = new Set([...(this.item.system.active_equipment_groups ?? []), this.item.system.active_equipment_group].filter(Boolean));
        const equipment = this.item.children.filter(x => x.type === 'equipment');
        const option = (id) => ({ id, active: active.has(id), items: equipment.filter(e => e.system.group === id) });
        data.youGet = groups.includes('core') ? option('core') : null;
        data.needsEquipment = needsEquipmentPick(this.item);
        const choices = new Map();
        for (const id of groups) {
            if (id === 'core') continue;
            const key = id.replace(/[_-]?\d+$/, '') || id;
            if (!choices.has(key)) choices.set(key, []);
            choices.get(key).push(option(id));
        }
        // Once a character picks an option it is locked (2026-09-30 review):
        // the others stay listed but ghosted and unpickable; the GM can
        // still change it
        const owned = this.item.isEmbedded || this.item.isChild;
        data.pickOnes = [...choices.entries()].map(([key, options]) => {
            const picked = owned && options.some(o => o.active);
            return {
                key,
                label: key === 'group' ? '' : key.replace(/_/g, ' '),
                picked,
                locked: picked && !game.user.isGM,
                options: options.map(o => ({ ...o, ghost: picked && !o.active })),
            };
        });
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('[data-action=add-equipment-group]').click(ev => {
            const id = foundry.utils.randomID();
            const groups = this.item.system.equipment_groups || [];
            groups.push(id);
            return this.item.update({'system.equipment_groups': groups});
        });

        html.find('[data-group-id] [data-action=delete-equipment-group]').click(async ev => {
            const target = $(ev.currentTarget);
            const groupId = target.closest('[data-group-id]').data('groupId');
            const groups = this.item.system.equipment_groups.filter(x => x !== groupId);

            const ids = this.item.children.filter(x => x.type === 'equipment' && x.system.group === groupId).map(item => item.id);
            Dialog.confirm({
              title: game.i18n.localize('heart.class.equipment.delete-title'),
              content: `<p>${game.i18n.localize('heart.class.equipment.delete-body')}</p>`,
              options: heartDialogOptions(),
              yes: () => {
                this.item.deleteChildren(ids);
                this.render();
                return this.item.update({'system.equipment_groups': groups});
              }
            });

        });

        html.find('[data-group-id] [data-action=activate-group]').click(async ev => {
            const target = $(ev.currentTarget);
            const groupId = target.closest('[data-group-id]').data('groupId');
            const activeGroupId = this.item.system.active_equipment_group;

            // On a character the pick is final: say so and ask first
            if (this.item.isEmbedded || this.item.isChild) {
                const names = this.item.children
                    .filter(x => x.type === 'equipment' && x.system.group === groupId)
                    .map(x => localizeHeart(x.name));
                const esc = (t) => Handlebars.escapeExpression(String(t ?? ''));
                const ok = await Dialog.confirm({
                    title: game.i18n.localize('heart.class.equipment.confirm-title'),
                    content: `<p>${esc(game.i18n.format('heart.class.equipment.confirm-body', { items: names.join(', ') }))}</p>`,
                    options: heartDialogOptions(),
                });
                if (!ok) return;
            }

            const childrenUpdates = {};

            // One option per choice, and only within that choice (2026-09-30
            // fix: picking dropped every other active group, so a class with
            // two choices, Blightborn's weapon_* and kit_*, lost one pick
            // when the other was made). Copies, never the live array.
            const choiceOf = (id) => String(id).replace(/[_-]?\d+$/, '') || String(id);
            const previousEquipmentGroups = [...(this.item.system.active_equipment_groups ?? [])];
            let activeEquipmentGroups = [...previousEquipmentGroups];
            if (groupId === "core") {
                if (!activeEquipmentGroups.includes('core')) activeEquipmentGroups.push('core');
            } else if (!activeEquipmentGroups.includes(groupId)) {
                const key = choiceOf(groupId);
                activeEquipmentGroups = activeEquipmentGroups.filter(g => g === 'core' || choiceOf(g) !== key);
                activeEquipmentGroups.push(groupId);
            }

            await this.item.update({'system.active_equipment_groups': activeEquipmentGroups});

            this.item.children.filter(x => x.type === 'equipment').forEach(async child => {
                if(previousEquipmentGroups.includes(child.system.group) && !activeEquipmentGroups.includes(child.system.group)) {
                    childrenUpdates[`${child.id}.system.active`] = false;
                }

                if(activeEquipmentGroups.includes(child.system.group)) {
                    childrenUpdates[`${child.id}.system.active`] = true;
                }
            });

            await this.item.updateChildren(childrenUpdates);
        });

        html.find('[data-group-id] [data-action=deactivate-group]').click(async ev => {
            // a character's pick is locked; only the GM can take it back
            if ((this.item.isEmbedded || this.item.isChild) && !game.user.isGM) return;
            const target = $(ev.currentTarget);
            const groupId = target.closest('[data-group-id]').data('groupId');

            const childrenUpdates = {};
            this.item.children.filter(x => x.type === 'equipment').forEach(async child => {
                if(child.system.group === groupId) {
                    childrenUpdates[`${child.id}.system.active`] = false;
                }
            });

            await this.item.updateChildren(childrenUpdates);
            const activeEquipmentGroups = this.item.system.active_equipment_groups.filter(g => g !== groupId);
            await this.item.update({'system.active_equipment_groups': activeEquipmentGroups});
        });
    }

    async _canDragDropItem(item) {
        if(item.type === 'ability' && item.type === undefined) {
            await item.update({'system.type': 'core'});
        }

        return ['ability', 'resource', 'equipment'].includes(item.type);
    }
}

export {
    data
}