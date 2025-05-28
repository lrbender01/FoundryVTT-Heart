async function rollStress(context) {
    const ev = context.event;
    const sheet = context.application;

    const div = $(ev.currentTarget).parents(".dice-roll");
    const roll_index = div.data("index");
    const roll = sheet.rolls[roll_index];
    if (roll) {
      const app = new game.heart.HeartStressRollHelperApplication(
        {},
        {
          critical:
            roll.outcome == "critical_success" ||
            roll.outcome === "critical_failure",
        }
      );
      app.render(true);
      roll.options.needs_stress_roll = false;
      await this.update({
        [`rolls.${roll_index}`]: await roll.toJSON(),
      });
      ui.chat.render();
    }
  }

export function renderChatMessageHTML(mesage, html, context) {
    
}

export class HeartChatMessage extends ChatMessage {
    static get ACTIONS() {
      const ACTIONS = super.ACTIONS;
      ACTIONS["roll-stress"] = HeartChatMessage.rollStress;
      ACTIONS["roll-fallout"] = HeartChatMessage.rollFallout;
      ACTIONS["apply"] = HeartChatMessage.apply;
      return ACTIONS;
    }
  
    static async rollFallout(context) {
      const ev = context.event;
      const sheet = context.application;
  
      const div = $(ev.currentTarget).parents(".dice-roll");
      const roll_index = div.data("index");
      const roll = sheet.rolls[roll_index];
      if (roll) {
        const fallout_roll = new game.heart.HeartFalloutRoll(
          `${roll.resistance.value} fallout`
        );
        await fallout_roll.toMessage();
        roll.options.needs_fallout_roll = false;
        await this.update({
          [`rolls.${roll_index}`]: await roll.toJSON(),
        });
        ui.chat.render();
      }
    }
  
    static async apply(context) {
      const ev = context.event;
      const sheet = context.application;
  
      const div = $(ev.currentTarget).parents(".dice-roll");
      const speaker = sheet.constructor.getSpeaker();
      const actor = speaker.actor;
      if (actor == null) {
        ui.notifications.warn("HEART.Roll.warning-apply");
        return;
      }
  
      const roll_index = div.data("index");
      const roll = sheet.rolls[roll_index];
      if (roll) {
        await roll.applyToActor(actor);
        await sheet.update({
          [`rolls.${roll_index}`]: await roll.toJSON(),
        });
        ui.chat.render();
      }
    }
  
    async renderHTML() {
      const html = await super.renderHTML();
      await this._onRender(html);
      return html;
    }
  
    async _renderRollHTML(isPrivate) {
      let html = "";
      for (let i = 0; i < this.rolls.length; i++) {
        html += await this.rolls[i].render({ isPrivate, index: i });
      }
      return html;
    }
  
    async _onRender(html) {
      const html = this.element;
      html.find("button.data-action").click((ev) => {
        ev.preventDefault();
      });
  
      html.querySelector(".data-action").forEach((element) => {
        const action = element.dataset.action;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          this.constructor.ACTIONS[action]({ event, application: this });
        });
      });
    }
  }
  