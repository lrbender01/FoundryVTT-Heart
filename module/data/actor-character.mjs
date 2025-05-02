import HeartActorBase from "./base-actor.mjs";
import migrations from "./migrations/actor-character-migrations.mjs";

class ResistanceField extends foundry.data.fields.SchemaField {
  constructor(options = {}) {
    return super({
      value: new foundry.data.fields.NumberField({
        integer: true,
        initial: 0,
        ...options,
      }),
      protection: new foundry.data.fields.NumberField({
        integer: true,
        initial: 0,
        label: "HEART.Resistance.protection",
      }),
    });
  }
}

export class SkillField extends foundry.data.fields.SchemaField {
  constructor(options = {}) {
    return super({
      value: new foundry.data.fields.NumberField({
        initial: 0,
        ...options,
      }),
      knack: new foundry.data.fields.StringField({initial: ""}),
    });
  }
}

export class DomainField extends foundry.data.fields.SchemaField {
  constructor(options = {}) {
    return super({
      value: new foundry.data.fields.NumberField({
        initial: 0,
        ...options,
      }),
      knack: new foundry.data.fields.StringField({initial: ""}),
    });
  }
}

export default class HeartCharacter extends HeartActorBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.notes = new fields.StringField();

    schema.resistances = new fields.SchemaField(
      Object.keys(CONFIG.HEART.resistances).reduce((out, key) => {
        out[key] = new ResistanceField({
          label: `HEART.Resistance.types.${key}`,
        });
        return out;
      }, {})
    );

    schema.domains = new fields.SchemaField(
      Object.keys(CONFIG.HEART.domains).reduce((out, key) => {
        out[key] = new DomainField({ label: `HEART.Domain.types.${key}` });
        return out;
      }, {})
    );

    schema.skills = new fields.SchemaField(
      Object.keys(CONFIG.HEART.skills).reduce((out, key) => {
        out[key] = new SkillField({ label: `HEART.Skill.types.${key}` });
        return out;
      }, {})
    );

    return schema;
  }

  static get migrations() {
    return migrations;
  }

  prepareDerivedData() {
    this.total_stress = Object.values(this.resistances).reduce(
      (total, resistance) => {
        total += resistance.value;
        return total;
      },
      0
    );
  }

  getRollData() {
    const data = {};

    data.skills = Object.entries(this.skills).reduce((out, [skill, data]) => {
      out[skill] = data.value ? 1 : 0;
      return out;
    }, {});

    data.domains = Object.entries(this.domains).reduce(
      (out, [domain, data]) => {
        out[domain] = data.value ? 1 : 0;
        return out;
      },
      {}
    );

    data.total_stress = this.total_stress;

    return data;
  }
}
