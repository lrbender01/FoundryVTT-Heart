import HeartActorBase from "./base-actor.mjs";
import {
  DomainsField,
  RollDifficultyField,
  ResistanceValueField,
} from "./common.mjs";
import migrations from "./migrations/actor-adversary-migrations.mjs";

export default class HeartAdversary extends HeartActorBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.names = new fields.StringField({
      label: "HEART.Actor.adversary.names",
      initial: "",
    });
    schema.descriptors = new fields.StringField({
      label: "HEART.Actor.adversary.descriptors",
      initial: "",
    });
    schema.motivation = new fields.StringField({
      label: "HEART.Actor.adversary.motivation",
      initial: "",
    });
    schema.difficulty = new RollDifficultyField();
    schema.resistance = new ResistanceValueField();
    schema.protection = new fields.NumberField({
      label: "HEART.Actor.adversary.protection",
      min: 0,
      initial: 0,
    });
    schema.special = new fields.StringField({
      label: "HEART.Actor.adversary.special",
      initial: ""
    });
    schema.domains = new DomainsField();

    return schema;
  }

  static get migrations() {
    return migrations;
  }
}
