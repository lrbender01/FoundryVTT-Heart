import { HeartBaseRollHelperApplication } from "./application-base-roll-helper.mjs";

export class HeartFalloutRollHelperApplication extends HeartBaseRollHelperApplication {
  static get helper_type() {
    return "fallout-roll";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["form", "heart", "fallout-roll-helper"],
      rollType: game.heart.HeartFalloutRoll,
      inputs: [
        {
          name: "resistance",
          label: game.i18n.localize("HEART.Resistance.label"),
          map: CONFIG.HEART.resistances,
          required: true,
        },
      ],
    });
  }

  get formula() {
    let formula = "";
    if (this.options.resistance) {
      formula += 
        game.i18n.localize(CONFIG.HEART.resistances[this.options.resistance]);
    }

    formula += " fallout"

    return formula;
  }
}
