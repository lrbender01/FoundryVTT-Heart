import HeartItemBase from "./base-item.mjs";
import { DomainField, DieSizeField, PseudoEmbeddedCollectionField } from "./common.mjs";
import migrations from "./migrations/item-resource-migrations.mjs";

export default class HeartResource extends HeartItemBase {
  static defineSchema() {
    const schema = super.defineSchema();

    schema.domain = new DomainField();
    schema.die_size = new DieSizeField();
    schema.items = new PseudoEmbeddedCollectionField(foundry.documents.BaseItem);

    return schema;
  }

  static get migrations() {
    return migrations;
  }

  prepareDerivedData() {
    this.domain_label = game.i18n.localize(CONFIG.HEART.domains[this.domain]);
    this.die_size_label = game.i18n.localize(CONFIG.HEART.die_sizes[this.die_size]);
  }
}
