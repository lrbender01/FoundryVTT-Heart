import { RollHelper } from "./roll-helper.mjs";
import { default as HeartStressRoll } from "../../rolls/roll-stress.mjs";
import { HEART } from "../../helpers/config.mjs";

export class StressRollHelper extends RollHelper {
  static get DEFAULT_OPTIONS() {
    const DEFAULT_OPTIONS = super.DEFAULT_OPTIONS;
    DEFAULT_OPTIONS.window.title = "HEART.Application.stress-roll-helper.title";
    return DEFAULT_OPTIONS;
  }

  static ROLL_TYPE = HeartStressRoll;

  static INPUTS = {
    critical: {
      name: "critical",
      label: "HEART.StressRoll.critical",
      boolean: true,
    },
    dice: {
      label: "HEART.StressRoll.dice",
      map: HEART.die_sizes,
      required: true,
    },
    resistance: {
      label: "HEART.Resistance.label",
      map: HEART.resistances,
      required: true,
    },
  };

  get formula() {
    let formula = "";

    if (this.inputs.critical.value) {
      formula += "HEART.StressRoll.critical" + " ";
    }

    if (this.inputs.dice.value) {
      formula += " " + HEART.die_sizes[this.inputs.dice.value];
    }

    if (this.inputs.resistance.value) {
      formula += " " + HEART.resistances[this.inputs.resistance.value];
    }

    formula += " stress";

    return formula;
  }
}
