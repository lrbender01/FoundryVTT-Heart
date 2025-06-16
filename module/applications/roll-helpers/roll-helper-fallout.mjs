import { RollHelper } from "./roll-helper.mjs";
import { default as HeartFalloutRoll } from "../../rolls/roll-fallout.mjs";
import { HEART } from "../../helpers/config.mjs";

export class FalloutRollHelper extends RollHelper {
  static get DEFAULT_OPTIONS() {
    const DEFAULT_OPTIONS = super.DEFAULT_OPTIONS;
    DEFAULT_OPTIONS.window.title = "HEART.Application.fallout-roll-helper.title";
    return DEFAULT_OPTIONS;
  }

  static ROLL_TYPE = HeartFalloutRoll;

  static INPUTS = {
    resistance: {
      label: "HEART.Resistance.label",
      map: HEART.resistances,
      required: true,
    },
  };

  get formula() {
    let formula = "";
    if (this.inputs.resistance.value) {
      formula += game.i18n.localize(HEART.resistances[this.inputs.resistance.value]);
    }

    formula += " fallout";

    return formula;
  }
}
