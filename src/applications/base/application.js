export default class HeartApplication extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      // heart-window: the class Heart's theme is scoped to (2026-09-30, Luke)
      classes: ["form", "heart", "heart-window", this.formType],
      resizable: true,
    });
  }

  static get formType() {
    return "base";
  }

  // (build and _roll went 2026-10-21: nothing called them)

  get title() {
    if (this.constructor.formType !== "base") {
      return game.i18n.localize(
        `heart.applications.${this.constructor.formType}.title`
      );
    } else {
      return super.title;
    }
  }

  // A form submitted by the browser (Enter in a field) reaches Foundry's
  // _onSubmit, whose own _updateObject throws "must implement" (Luke,
  // 2026-10-21). Forms that save override this.
  async _updateObject() {}

  activateListeners(html) {
    html.find("button").click((ev) => {
      ev.preventDefault();
    });

    html.find("[data-action=cancel]").click((ev) => {
      this.close();
    });
  }
}
