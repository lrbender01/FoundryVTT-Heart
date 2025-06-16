export default class HeartBaseRoll extends Roll {
  static create(formula, data, options) {
    return new this(formula, data, options);
  }

  static CHAT_TEMPLATE = "systems/heart/templates/dice/roll.hbs";

  get formula() {
    return this._formula;
  }

  get result() {
    if (this._total > 2) {
      return "BIG";
    } else {
      return "SMALL";
    }
  }

  get total() {
    return this.result;
  }

  // This is hacky, but we do what we have to
  async render({
    flavor,
    template = this.constructor.CHAT_TEMPLATE,
    isPrivate = false,
    index,
  } = {}) {
    if (!this._evaluated) await this.evaluate();
    const chatData = await this.getData({flavor, isPrivate, index});
    return foundry.applications.handlebars.renderTemplate(template, chatData);
  }

  async getData({flavor, isPrivate = false, index}={}) {
    return {
      formula: isPrivate ? "???" : this._formula,
      flavor: isPrivate ? null : flavor ?? this.options.flavor,
      user: game.user.id,
      tooltip: isPrivate ? "" : await this.getTooltip(),
      total: this.result,
      index,
    };
  }
}
