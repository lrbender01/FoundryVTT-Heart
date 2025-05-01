export class HeartBaseRollHelperApplication extends FormApplication {
  static get helper_type() {
    return "base";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["form", "heart", `${this.helper_type}-helper`],
      rollType: Roll,
      inputs: [],
      types: [],
      hints: [],
      findMany: false,
      width: 600,
      height: "auto",
    });
  }

  get template() {
    return `systems/heart/templates/application/application-roll-helper.hbs`;
  }

  get title() {
    return game.i18n.localize(
      `HEART.Application.${this.constructor.helper_type}-helper.title`
    );
  }

  get formula() {
    return "1d6";
  }

  getData(options={}) {
    let data = super.getData();
    data.formula = this.formula;
    data.inputs = this.options.inputs.reduce((inputs, input) => {
        inputs[input.name] = {
            "label": input.label,
            "choices": {"":"", ...input.map},
            "boolean": input.boolean,
            "required": input.required,
            "value": this.options[input.name]
        }
        return inputs;
    }, {});
    data.num_inputs = this.options.inputs.length;
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("button").click((ev) => {
      ev.preventDefault();
    });

    html.find("[data-action=roll]").click(async (ev) => {
      const roll = this.options.rollType.create(this.formula);
      await roll.toMessage();

      this.close();
    });

    html.find("[data-action=request-roll]").click((ev) => {
      CONFIG.ChatMessage.documentClass.create({
        content: `[[/roll ${this.formula}]]`,
      });
      this.close();
    });

    html.find("select[name]").change((ev) => {
      const target = $(ev.currentTarget);
      const name = target.attr("name");
      const v = target.val();
      this.options[name] = v;
      this.render();
    });

    html.find("div.checkbox[name]").click((ev) => {
      const element = $(ev.currentTarget);
      const name = element.attr("name");
      this.options[name] = !this.options[name];
      this.render();
    });
  }
}
