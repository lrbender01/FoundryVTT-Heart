const { HTMLField, NumberField, SchemaField, StringField } =
  foundry.data.fields;
import { ActorDataModel } from "./actor.js";

export class ResistanceField extends SchemaField {
  constructor() {
    super({
      value: new NumberField({ integer: true, initial: 0 }),
      max: new NumberField({ integer: true, initial: 10 }),
      protection: new NumberField({ integer: true, initial: 0 }),
    });
  }
}

export class SkillField extends SchemaField {
  constructor() {
    super({
      value: new NumberField({ integer: true, initial: 0 }),
      knack: new StringField(),
    });
  }
}

export class DomainField extends SchemaField {
  constructor() {
    super({
      value: new NumberField({ integer: true, initial: 0 }),
      knack: new StringField(),
    });
  }
}

export class CharacterDataModel extends ActorDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      notes: new HTMLField(),
      resistances: new SchemaField({
        blood: new ResistanceField(),
        mind: new ResistanceField(),
        echo: new ResistanceField(),
        fortune: new ResistanceField(),
        supplies: new ResistanceField(),
      }),
      skills: new SchemaField({
        compel: new SkillField(),
        delve: new SkillField(),
        discern: new SkillField(),
        endure: new SkillField(),
        evade: new SkillField(),
        hunt: new SkillField(),
        kill: new SkillField(),
        mend: new SkillField(),
        sneak: new SkillField(),
      }),
      domains: new SchemaField({
        cursed: new DomainField(),
        desolate: new DomainField(),
        haven: new DomainField(),
        occult: new DomainField(),
        religion: new DomainField(),
        technology: new DomainField(),
        warren: new DomainField(),
        wild: new DomainField(),
      }),
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    this.totalStress = Object.values(this.resistances).reduce(
      (sum, resistance) => {
        return sum + resistance.value;
      },
      0
    );
  }
}
