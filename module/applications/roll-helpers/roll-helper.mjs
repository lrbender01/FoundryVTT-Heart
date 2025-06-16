import { default as HeartRoll } from "../../rolls/roll-heart.mjs";
import { HEART } from "../../helpers/config.mjs";

export class RollHelper extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static get DEFAULT_OPTIONS() {
    const DEFAULT_OPTIONS = super.DEFAULT_OPTIONS;
    DEFAULT_OPTIONS.actions = {
      "roll-dice": RollHelper.rollDice,
      "request-roll": RollHelper.requestRoll,
      "select-option": RollHelper.selectOption,
      "check-box": RollHelper.checkBox,
    };
    DEFAULT_OPTIONS.window.title = "HEART.Application.roll-helper.title";
    return DEFAULT_OPTIONS;
  }

  static PARTS = {
    body: {
      template:
        "systems/heart/templates/application/application-roll-helper.hbs",
    },
  };

  static ROLL_TYPE = HeartRoll;

  static INPUTS = {
    difficulty: {
      label: "HEART.Roll.difficulty.label",
      map: HEART.roll_difficulty_types,
      value: undefined,
    },
    domain: {
      label: "HEART.Domain.label",
      map: HEART.domains,
      required: true,
      value: undefined,
    },
    skill: {
      label: "HEART.Skill.label",
      map: HEART.skills,
      required: true,
      value: undefined,
    },
    has_mastery: {
      label: "HEART.Roll.mastery",
      boolean: true,
      value: false,
    },
  };

  inputs = this.constructor.INPUTS;

  static async rollDice() {
    const roll = this.constructor.ROLL_TYPE.create(this.formula);
    await roll.toMessage({}, {create: true});
    this.close();
  }

  static async requestRoll() {
    CONFIG.ChatMessage.documentClass.create({
      content: `[[/roll ${this.formula}]]`,
    });
    this.close();
  }

  static async selectOption(ev) {
    const element = ev.currentTarget;
    const name = element.getAttribute("name");
    this.inputs[name].value = element.value;
    this.render();
  }

  static async checkBox(_, element) {
    const name = element.getAttribute("name");
    this.inputs[name].value = !(this.inputs[name].value ?? true);
    this.render();
  }

  get formula() {
    let formula = "";

    const difficulty = this.inputs.difficulty.value;
    const domain = this.inputs.domain.value;
    const skill = this.inputs.skill.value;
    const has_mastery = this.inputs.has_mastery.value;

    if (difficulty) {
      formula +=
        game.i18n.localize(
          HEART.roll_difficulty_types[difficulty]
        ) + " ";
    }

    if (domain) {
      formula += game.i18n.localize(HEART.domains[domain]);
    }

    if (skill) {
      formula += " + " + game.i18n.localize(HEART.skills[skill]);
    }

    if (has_mastery) {
      formula += " + " + game.i18n.localize("HEART.Roll.mastery");
    }

    return formula;
  }

  async _prepareContext(options = {}) {
    let context = await super._prepareContext();
    context.formula = this.formula;

    context.inputs = Object.entries(this.inputs).reduce((inputs, [name, input]) => {
      inputs[name] = {choices: { "": "", ...input.map}, ...input};
      return inputs;
    }, {});
    context.num_inputs = Object.values(this.inputs).length;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element.querySelectorAll("select[name]").forEach(el => el.addEventListener('change', RollHelper.selectOption.bind(this)));
  }
}
