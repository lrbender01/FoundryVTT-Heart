import HeartActorBase from "./base-actor.mjs";
import { DomainsField, DieSizeField, TierField, ResistanceValueField } from "./common.mjs";
import migrations from "./migrations/actor-landmark-migrations.mjs";

export default class HeartLandmark extends HeartActorBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.domains = new DomainsField();
    schema.tier = new TierField();
    schema.resistance = new ResistanceValueField();
    
    schema.description = new fields.StringField({
      label: "Description",
    });
    schema.special_rules = new fields.StringField({
      label: "HEART.Actor.landmark.special_rules",
    });
    schema.base_stress = new DieSizeField();
    schema.potential_plots = new fields.StringField({
      label: "HEART.Actor.landmark.potential_plots",
    });

    return schema;
  }

  static get migrations() {
    return migrations;
  }
}
