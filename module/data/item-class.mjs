import HeartItemBase from "./base-item.mjs";
import {
  PseudoEmbeddedCollectionField,
  SkillField,
  DomainField,
} from "./common.mjs";
import migrations  from "./migrations/item-class-migrations.mjs";

export default class HeartClass extends HeartItemBase {
  static defineSchema() {
    const schema = super.defineSchema();

    schema.domain = new DomainField();
    schema.skill = new SkillField();
    schema.items = new PseudoEmbeddedCollectionField(foundry.documents.BaseItem);

    return schema;
  }

  prepareDerivedData() {
    this.domain_label = game.i18n.localize(CONFIG.HEART.domains[this.domain]);
    this.skill_label = game.i18n.localize(CONFIG.HEART.skills[this.skill]);
  }

  static get migrations() {
    return migrations;
  }
}
