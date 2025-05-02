import Parser from "../grammars/heart-fallout-roll-grammar.mjs";
import HeartBaseRoll from "./roll-base.mjs";

export default class HeartFalloutRoll extends HeartBaseRoll {
  static parser = Parser;

  static parse(formula, data = {}) {
    const replaced = this.replaceFormulaData(formula, data);
    const parsed_data = Parser.parse(replaced);

    return [
      new foundry.dice.terms.PoolTerm({
        terms: ["1d12"],
        options: {
          flavor: parsed_data.resistance.value,
          formula,
        },
      }),
    ];
  }

  static getFormula(terms) {
    return terms[0].options.formula;
  }

  constructor() {
    super(...arguments);
    this.options.total_stress ??= this.data.total_stress;
  }

  get fallout_type() {
    const total_stress = this.options.total_stress;

    if (this._total > total_stress) {
      return "none";
    }

    if (this._total <= 6) {
      return "minor";
    }

    return "major";
  }

  get result() {
    let extra = "";
    if (this.options && this.options.total_stress) {
      const fallout = game.i18n.localize(
        CONFIG.HEART.fallout_types[this.fallout_type]
      );
      extra = ` vs ${this.options.total_stress}: ${fallout}`;
    }
    return `${this._total}${extra}`;
  }

  async applyToActor(actor_id) {
    const data = Parser.parse(this.formula);
    const resistance = data.resistance.key;
    await game.actors.get(actor_id).update({
      [`system.resistances.${resistance}.value`]: 0,
    });
    this.options.needs_to_apply = false;
  }

  async evaluate(options) {
    const out = await super.evaluate(options);
    if (this.fallout_type !== "none") {
      if (this.data.actor) {
        await this.applyToActor(this.data.actor);
      } else {
        const speaker = CONFIG.ChatMessage.documentClass.getSpeaker();
        if (speaker.actor !== null) {
          await this.applyToActor(speaker.actor);
        } else {
          this.options.needs_to_apply = true;
        }
      }
    } else {
      this.options.needs_to_apply = false;
    }
    return out;
  }


  async getData(options={}) {
    const data = await super.getData(options);
    data.needs_to_apply = this.options.needs_to_apply;
    return data;
  }
}
