export class HeartChatMessage extends ChatMessage {
  async getHTML() {
    const html = await super.getHTML();
    await this.activateListeners(html);
    return html;
  }

  async _renderRollHTML(isPrivate) {
    let html = "";
    for (let i = 0; i < this.rolls.length; i++) {
      html += await this.rolls[i].render({ isPrivate, index: i });
    }
    return html;
  }

  async activateListeners(html) {
    html.find("button.data-action").click((ev) => {
      ev.preventDefault();
    });

    html.find("[data-action=roll-stress]").click(async (ev) => {
      ev.stopPropagation();

      const div = $(ev.currentTarget).parents(".dice-roll");
      const roll_index = div.data("index");
      const roll = this.rolls[roll_index];
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
    });

    html.find("[data-action=roll-fallout]").click(async (ev) => {
      ev.stopPropagation();

      const div = $(ev.currentTarget).parents(".dice-roll");
      const roll_index = div.data("index");
      const roll = this.rolls[roll_index];
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
    });

    html.find("[data-action=apply]").click(async (ev) => {
      ev.stopPropagation();
      const div = $(ev.currentTarget).parents(".dice-roll");
      const speaker = this.constructor.getSpeaker();
      const actor = speaker.actor;
      if (actor == null) {
        ui.notifications.warn('HEART.Roll.warning-apply');
        return;
      }

      const roll_index = div.data("index");
      const roll = this.rolls[roll_index];
      if (roll) {
        await roll.applyToActor(actor);
        await this.update({
          [`rolls.${roll_index}`]: await roll.toJSON(),
        });
        ui.chat.render();
      }
    });
  }
}
