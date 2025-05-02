import Parser from "../grammars/heart-roll-grammar.mjs";
import HeartBaseRoll from "./roll-base.mjs";

export default class HeartRoll extends HeartBaseRoll {
  static parse(formula, data = {}) {
    const replaced = this.replaceFormulaData(formula, data);
    const parsed_data = Parser.parse(replaced);

    let terms = ["d10[base]"];

    data.domains ??= {};
    data.skills ??= {};
    data.domain = parsed_data.domain;
    data.skill = parsed_data.skill;

    if (data.domains[parsed_data.domain]) {
      terms.push(`d10[${parsed_data.domain}]`);
    }

    if (data.skills[parsed_data.skill]) {
      terms.push(`d10[${parsed_data.skill}]`);
    }

    if (parsed_data.has_mastery) {
      terms.push(`d10[mastery]`);
    }

    let modifier = "";
    if (parsed_data.difficulty === "risky") {
      if (terms.length <= 2) {
        terms = [
            '1d10[tough]'
        ];
      } else {
        modifier = "dh1";
      }
    } else if (parsed_data.difficulty === "dangerous") {
      if (terms.length <= 2) {
        terms = [
            '1d10[tough]'
        ];
      } else {
        modifier = "dh2";
      }
    }
    modifier += "kh1";

    return [
      new foundry.dice.terms.PoolTerm({
        terms,
        modifiers: [modifier],
        options: { flavor: formula },
      }),
    ];
  }

  static getFormula(terms) {
    return terms[0].flavor;
  }

  get outcome() {
    let dice = 1;
    if (
      this.data.domains &&
      this.data.domains[this.options.domain] !== undefined
    ) {
      dice += 1;
    }
    if (
      this.data.skills &&
      this.data.skills[this.options.skill] !== undefined
    ) {
      dice += 1;
    }
    if (this.options.has_mastery) {
      dice += 1;
    }

    if (this.options.difficulty === "risky") {
      dice -= 1;
    } else if (this.options.difficulty === "dangerous") {
      dice -= 2;
    }

    if (dice <= 0) {
      if (this.total < 10) {
        return "failure";
      } else {
        return "success_at_a_cost";
      }
    }

    const t = this._total;
    if (t == 1) {
      return "critical_failure";
    } else if (t <= 5) {
      return "failure";
    } else if (t <= 7) {
      return "success_at_a_cost";
    } else if (t <= 9) {
      return "success";
    } else {
      return "critical_success";
    }
  }

  get result() {
    return (
      `${this._total}: ` +
      game.i18n.localize(CONFIG.HEART.roll_result_types[this.outcome])
    );
  }

  async evaluate() {
    const out = await super.evaluate(...arguments);
    const outcome = this.outcome;
    this.options.needs_stress_roll = outcome !== 'success' && outcome !== 'critical_success';
    return out;
  }

  async getData(options={}) {
    const data = await super.getData(options);
    data.needs_stress_roll = this.options.needs_stress_roll;
    return data;
  }
}
