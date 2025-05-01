import Parser from "./heart-stress-roll-grammar.mjs";
import HeartBaseRoll from "./roll-base.mjs";

export default class HeartStressRoll extends HeartBaseRoll {
  static parse(formula, data = {}) {
    const replaced = this.replaceFormulaData(formula, data);
    const parsed_data = Parser.parse(replaced);

    let terms;
    if (parsed_data.critical) {
      terms = [`2 * ${parsed_data.dice.formula}`];
    } else {
      terms = [parsed_data.dice.formula];
    }

    return [
      new foundry.dice.terms.PoolTerm({
        terms,
        options: { flavor: parsed_data.resistance.value, formula },
      }),
    ];
  }

  static getFormula(terms) {
    return terms[0].options.formula;
  }

  get result() {
    return `${this._total}`;
  }

  async applyToActor(actor_id) {
    const resistance = this.resistance.key;
    const actor = game.actors.get(actor_id);
    await actor.update({
      [`system.resistances.${resistance}.value`]:
        this._total + actor.system.resistances[resistance].value,
    });
    this.options.needs_to_apply = false;
  }

  async evaluate(options) {
    const out = await super.evaluate(options);
    this.options.needs_fallout_roll = true;
    if (this.data.actor !== undefined) {
      await this.applyToActor(this.data.actor);
    } else {
      const speaker = CONFIG.ChatMessage.documentClass.getSpeaker();
      if (speaker.actor !== null) {
        await this.applyToActor(speaker.actor);
      } else {
        this.options.needs_to_apply = true;
      }
    }
    return out;
  }

  async getData(options={}) {
    const data = await super.getData(options);
    data.needs_fallout_roll = !this.options.needs_to_apply && this.options.needs_fallout_roll;
    data.needs_to_apply = this.options.needs_to_apply;
    return data;
  }

  get resistance() {
    return Parser.parse(this.formula).resistance;
  }
}
