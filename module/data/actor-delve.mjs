import HeartActorBase from "./base-actor.mjs";
import {
  DomainsField,
  DieSizeField,
  TiersField,
  ResistanceValueField,
} from "./common.mjs";
import migrations from "./migrations/actor-delve-migrations.mjs";

export default class HeartDelve extends HeartActorBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.route = new fields.StringField({
      label: "HEART.Actor.delve.route",
    });
    schema.tiers = new TiersField();
    schema.domains = new DomainsField();
    schema.stress = new DieSizeField({
      label: "HEART.common.stress",
    });
    schema.resistance = new ResistanceValueField();
    schema.description = new fields.StringField({
      label: "Description",
    });
    schema.events = new fields.StringField({
      label: "HEART.Actor.delve.events",
    });
    schema.connection = new fields.StringField({
      label: "HEART.Actor.delve.connection",
    });
    schema.notes = new fields.StringField({
      label: "HEART.common.notes",
    });

    return schema;
  }

  static get migrations() {
    return migrations;
  }
}
