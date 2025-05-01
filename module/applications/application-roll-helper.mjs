import { HeartBaseRollHelperApplication } from "./application-base-roll-helper.mjs";

export class HeartRollHelperApplication extends HeartBaseRollHelperApplication {
  static get helper_type() {
    return "roll";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["form", "heart", "roll-helper"],
      rollType: game.heart.HeartRoll,
      inputs: [
        {
          name: "difficulty",
          label: game.i18n.localize("HEART.Roll.difficulty.label"),
          map: CONFIG.HEART.roll_difficulty_types,
        },
        {
          name: "domain",
          label: game.i18n.localize("HEART.Domain.label"),
          map: CONFIG.HEART.domains,
          required: true
        },
        {
          name: "skill",
          label: game.i18n.localize("HEART.Skill.label"),
          map: CONFIG.HEART.skills,
          required: true
        },
        {
          name: "has_mastery",
          label: game.i18n.localize("HEART.Roll.mastery"),
          boolean: true,
        },
      ],
    });
  }

  get formula() {
    let formula = "";

    if (this.options.difficulty) {
      formula +=
        game.i18n.localize(
          CONFIG.HEART.roll_difficulty_types[this.options.difficulty]
        ) + " ";
    }

    if (this.options.domain) {
      formula += game.i18n.localize(CONFIG.HEART.domains[this.options.domain]);
    }

    if (this.options.skill) {
      formula +=
        " + " + game.i18n.localize(CONFIG.HEART.skills[this.options.skill]);
    }

    if (this.options.has_mastery) {
      formula += " + " + game.i18n.localize("HEART.Roll.mastery");
    }

    return formula;
  }
}
