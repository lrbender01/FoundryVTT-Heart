import { HeartBaseRollHelperApplication } from "./application-base-roll-helper.mjs";

export class HeartStressRollHelperApplication extends HeartBaseRollHelperApplication {
  static get helper_type() {
    return "stress-roll";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["form", "heart", "stress-roll-helper"],
      rollType: game.heart.HeartStressRoll,
      inputs: [
        {
          name: "critical",
          label: game.i18n.localize("HEART.StressRoll.critical"),
          boolean: true,
        },
        {
          name: "resistance",
          label: game.i18n.localize("HEART.Resistance.label"),
          map: CONFIG.HEART.resistances,
          required: true,
        },
        {
          name: "dice",
          label: game.i18n.localize("HEART.StressRoll.dice"),
          map: CONFIG.HEART.die_sizes,
          required: true,
        },
      ],
      dice: ""
    });
  }

  get formula() {
    let formula = "";

    if (this.options.critical) {
      formula += game.i18n.localize("HEART.StressRoll.critical") + " ";
    }

    if (this.options.resistance) {
      formula +=
        " " +
        game.i18n.localize(CONFIG.HEART.resistances[this.options.resistance]);
    }

    formula += " stress"

    if (this.options.dice) {
      formula +=
        " " + game.i18n.localize(CONFIG.HEART.die_sizes[this.options.dice]);
    }

    return formula;
  }
}
