export { PseudoEmbeddedCollectionField } from "./pseudo.mjs";

export class ListItemField extends foundry.data.fields.StringField {
  constructor(object, options = {}) {
    const keys = Object.keys(object);
    super({
      ...options,
      choices: keys,
      initial: keys[0],
      choiceLabels: object,
    });
  }

  get choiceLabels() {
    return this.options.choiceLabels;
  }
}

export class DomainField extends ListItemField {
  constructor() {
    super(CONFIG.HEART.domains, { label: "HEART.Domain.label" });
  }
}

export class DomainsField extends foundry.data.fields.ArrayField {
  constructor() {
    super(new DomainField(), {
      label: "HEART.Domain.label-plural",
      initial: [],
    });
  }
}

export class SkillField extends ListItemField {
  constructor() {
    super(CONFIG.HEART.skills, { label: "HEART.Skill.label" });
  }
}

export class DieSizeField extends foundry.data.fields.NumberField {
  constructor(options = {}) {
    super({
      label: options.label ?? "HEART.DieSize.label",
      choices: Object.keys(CONFIG.HEART.die_sizes).map((d) => parseInt(d)),
      integer: true,
      initial: options.initial ?? 6,
      choiceLabels: CONFIG.HEART.die_sizes,
    });
  }

  get choiceLabels() {
    return this.options.choiceLabels;
  }
}

export class ResistanceField extends ListItemField {
  constructor() {
    super(CONFIG.HEART.resistances, { label: "HEART.Resistance.label" });
  }
}

export class ResistancesField extends foundry.data.fields.ArrayField {
  constructor() {
    super(new ResistanceField(), {
      label: "HEART.Resistance.label-plural",
      initial: [],
    });
  }
}

export class TierField extends foundry.data.fields.NumberField {
  constructor() {
    super({
      integer: true,
      label: "HEART.Tier.label",
      choices: Object.keys(CONFIG.HEART.tier_types).map((d) => parseInt(d)),
      initial: 0,
      choiceLabels: CONFIG.HEART.tier_types,
    });
  }

  get choiceLabels() {
    return this.options.choiceLabels;
  }
}

export class TiersField extends foundry.data.fields.ArrayField {
  constructor() {
    super(new TierField(), {
      label: "HEART.Tier.label-plural",
      initial: [],
    });
  }
}

export class RollDifficultyField extends ListItemField {
  constructor(options = {}) {
    return super(CONFIG.HEART.roll_difficulty_types, {
      label: "HEART.Roll.difficulty.label",
      ...options,
    });
  }
}

export class ResistanceValueField extends foundry.data.fields.NumberField {
  constructor() {
    super({
      label: "HEART.Resistance.label",
      integer: true,
      initial: 10,
      min: 0,
    });
  }
}
