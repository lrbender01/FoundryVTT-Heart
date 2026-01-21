import { dataModels as actorDataModels } from "./models/actors/index.js";
import { dataModels as itemDataModels } from "./models/items/index.js";

import { HeartActor } from "./documents/actor.js";
import { HeartItem } from "./documents/item.js";

import { registerItemSheets } from "./sheets/items/index.js";
import { registerActorSheets } from "./sheets/actors/index.js";

import { items } from "./util.js";

Hooks.once("init", async function () {
  CONFIG.Actor.dataModels = actorDataModels;
  CONFIG.Item.dataModels = itemDataModels;

  CONFIG.Actor.documentClass = HeartActor;
  CONFIG.Item.documentClass = HeartItem;

  CONFIG.Item.typeLabels = items;

  registerItemSheets();
  registerActorSheets();

  Handlebars.registerHelper("ordered-checkable", function (value, max) {
    let output = "";
    for (let i = 0; i < max; i++) {
      output += `<a data-index="${i}" class="ordered-checkable-box${
        i < value ? " checked" : ""
      }"></a>`;
    }
    return output;
  });

  Handlebars.registerHelper("forEach", function (context, options) {
    let output = "";

    Object.entries(context).forEach(([key, value]) => {
      const result = options.fn(this, {
        blockParams: [value, key],
      });
      output += result;
    });
    return output;
  });

  Handlebars.registerHelper("repeat", function (count, options) {
    let output = "";

    for (let i = 0; i < count; i++) {
      const result = options.fn(this, { data: { index: i } });
      output += result;
    }
    return output;
  });

  Handlebars.registerHelper("add", function (a, b, options) {
    return a + b;
  });

  Handlebars.registerHelper("sub", function (a, b, options) {
    return a - b;
  });

  Handlebars.registerHelper("foreignPartial", function (partial, uuid) {
    let contents = "";
    let data = {};
    if (typeof uuid === "function") {
      data = uuid();
      contents = Handlebars.partials[partial]({ document: data });
      uuid = data.uuid;
    }
    const this_ = this;
    const args = arguments;
    const id = foundry.utils.randomID();
    if (uuid === undefined) {
      console.warn("you need a better uuid", this);
      return;
    }
    fromUuid(uuid).then((doc) => {
      let attempts = 0;
      let maxAttempts = 10;
      function attemptToReplace() {
        const matches = document.querySelectorAll(`[data-async="${id}"]`);
        if (matches.length === 0) {
          attempts += 1;
          if (attempts < maxAttempts) {
            window.setTimeout(attemptToReplace, 1000);
          } else {
            console.error(
              "ran out of attempts while trying to find",
              id,
              partial,
              uuid,
              this_,
              args,
              data
            );
          }
          return;
        }
        const contents = Handlebars.partials[partial]({ document: doc });
        matches.forEach((d) => {
          const tmp = document.createElement("div");
          tmp.innerHTML = contents;
          d.replaceWith(tmp.firstChild);
        });
      }
      attemptToReplace();
    });
    return `<div data-async="${id}">${contents}</div>`;
  });
});

Hooks.once("ready", async function () {
  const packItems = game.packs.get("heart.heart").index;
  Object.keys(items).forEach(async (key) => {
    const packValues = packItems.filter((x) => x.type === key);
    if (packValues.length === 0) {
      return;
    }
    //(await fromUuid(packValues[0].uuid)).sheet.render(true);
  });
});

class HeartLabel extends HTMLDivElement {}

window.customElements.define("heart-label", HeartLabel, { extends: "div" });

function drawSquares(value, max) {
  this.innerHTML = "";

  for (let i = 0; i < value; i++) {
    const el = document.createElement("i");
    el.classList.add("fas", "fa-square");
    el.dataset.value = i + 1;
    this.appendChild(el);
  }

  for (let i = 0; i < max - value; i++) {
    const el = document.createElement("i");
    el.classList.add("far", "fa-square");
    el.dataset.value = i + value + 1;
    this.appendChild(el);
  }
}

class HeartBoxes extends HTMLElement {
  static observedAttributes = ["name", "max", "value"];

  constructor() {
    super();
    drawSquares.call(this, this.value, this.max);
    this.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const value = parseInt(event.target.dataset.value);
      if (value === this.value) {
        this.value = value - 1;
      } else {
        this.value = value;
      }
    });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    drawSquares.call(this, this.value, this.max);
  }

  get max() {
    const v = parseInt(this.getAttribute("max"));
    return isNaN(v) ? 10 : v;
  }
  get value() {
    const v = parseInt(this.getAttribute("value"));
    return isNaN(v) ? 5 : v;
  }

  set max(value) {
    if (isNaN(v)) {
      return;
    }
    this.setAttribute("max", value);
  }
  set value(value) {
    const v = parseInt(value);
    if (isNaN(v)) {
      return;
    }
    this.setAttribute("value", v > this.max ? this.max : v);
    this.dispatchEvent(new Event("change"));
  }
}

window.customElements.define("heart-boxes", HeartBoxes);

class HeartSkillDomain extends HTMLElement {
  static observedAttributes = ["value", "disabled"];
  constructor() {
    super();
    this.checkbox = document.createElement("i");
    this.checkbox.classList.add("far", "fa-square");
    this.prepend(this.checkbox);

    this.listener = this.checkbox.addEventListener("click", (e) => {
      if(this.hasAttribute("disabled")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(e.shiftKey) {
        if (this.value < 2) {
          this.value = 2;
        } else {
          this.value = 1;
        }
      } else {
        let v = this.value === 2 ? 1 : this.value;
        this.value = 1 - v;
      }
    });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "value") {
      if (newValue > 0) {
        this.checkbox.classList.add("fa-square-x");
        this.checkbox.classList.remove("fa-square");
      } else {
        this.checkbox.classList.add("fa-square");
        this.checkbox.classList.remove("fa-square-x");
      }
      this.dispatchEvent(new Event("change"));
    } 
  }

  get value() {
    return parseInt(this.getAttribute("value")) || 0;
  }

  set value(value) {
    const v = parseInt(value);
    if (v === null) {
      return;
    }
    this.setAttribute("value", value);
  }
}

window.customElements.define("heart-skilldomain", HeartSkillDomain);
