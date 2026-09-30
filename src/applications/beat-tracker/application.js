import applicationHTML from "./application.html";
import HeartApplication from "../base/application.js";
import { activateBeatListeners } from "../../items/beat/actions";

// Beat Tracker (wired 2026-09-29): one window listing every character's
// active beats - the two a character is chasing on their calling plus any
// loose beats on the actor - so the GM can see at a glance who is close to
// an advance. Activate / Complete buttons work in place for owners; the window refreshes
// itself when characters or their items change.
//
// Opened from the "Beats" button in the Actors sidebar header, or
// game.heart.openBeatTracker(). Players see the characters they can observe.

let instance = null;

function characterBeats(actor) {
  const isBeat = (item) => item.type === "beat" && item.system.active;
  const calling = actor.items.find((item) => item.type === "calling");
  const beats = [...(calling?.children ?? []).filter(isBeat), ...actor.items.filter(isBeat)];
  const order = { minor: 0, major: 1, zenith: 2 };
  return beats.sort((a, b) => (order[a.system.type] ?? 9) - (order[b.system.type] ?? 9));
}

export default class BeatTrackerApplication extends HeartApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "heart-beat-tracker",
      template: applicationHTML.path,
      width: 560,
      height: "auto",
      resizable: true,
    });
  }

  static get formType() {
    return "beat-tracker";
  }

  static open() {
    if (!instance) instance = new this();
    return instance.render(true);
  }

  static refresh() {
    if (instance?.rendered) instance.render(false);
  }

  getData() {
    const data = super.getData();
    const actors = game.actors.filter(
      (actor) => actor.type === "character" && actor.testUserPermission(game.user, "OBSERVER")
    );
    // The GM's list is the party (player-owned characters) when there is one
    const party = actors.filter((actor) => actor.hasPlayerOwner);
    const shown = game.user.isGM && party.length ? party : actors;

    const characters = shown
      .map((actor) => ({
        actor,
        calling: game.i18n.localize(actor.items.find((item) => item.type === "calling")?.name ?? ""),
        callingImg: actor.items.find((item) => item.type === "calling")?.img ?? "",
        beats: characterBeats(actor),
      }))
      .sort((a, b) => a.actor.name.localeCompare(b.actor.name));

    return foundry.utils.mergeObject(data, { characters });
  }

  activateListeners(html) {
    super.activateListeners(html);

    const itemFor = (ev) => fromUuid(ev.currentTarget.closest("[data-item-id]").dataset.itemId);

    html.find("[data-item-id] [data-action=view]").click(async (ev) => {
      ev.preventDefault();
      (await itemFor(ev))?.sheet.render(true);
    });
    // Activate / Complete buttons, same rules as the sheets
    activateBeatListeners(html);
    html.find("[data-action=open-actor]").click((ev) => {
      ev.preventDefault();
      game.actors.get(ev.currentTarget.dataset.actorId)?.sheet.render(true);
    });
  }

  async _updateObject() {}
}

export function initialise() {
  game.heart.openBeatTracker = () => BeatTrackerApplication.open();

  // Live refresh: beats live on actors or inside a calling's children, so any
  // item or character change may alter the list. Debounced - one completion
  // can fire several hooks.
  const refresh = foundry.utils.debounce(() => BeatTrackerApplication.refresh(), 100);
  for (const hook of ["createItem", "updateItem", "deleteItem", "createActor", "updateActor", "deleteActor"]) {
    Hooks.on(hook, refresh);
  }

  // Launch point: a button in the Actors sidebar header
  Hooks.on("renderActorDirectory", (app, html) => {
    const root = html instanceof jQuery ? html[0] : html;
    const actions = root.querySelector(".header-actions");
    if (!actions || actions.querySelector(".heart-beat-tracker-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "heart-beat-tracker-button";
    button.innerHTML = `<i class="fas fa-flag-checkered"></i> ${game.i18n.localize("heart.applications.beat-tracker.open")}`;
    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      BeatTrackerApplication.open();
    });
    actions.append(button);
  });
}
