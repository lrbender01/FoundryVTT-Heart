import { PseudoDataModelMixin } from "./pseudo.mjs";
import HeartDataModel from "./base-model.mjs";

export default class HeartItemBase extends PseudoDataModelMixin(HeartDataModel) {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.model_version = new fields.StringField({
      initial: this.latest_version,
    });

    schema.description = new fields.StringField({
      required: true,
      blank: true,
      initial: "",
      label: "HEART.description",
    });
    return schema;
  }

  static get migrations() {
    return {};
  }

  static migrateData(source) {
    return super.migrateData(
      Object.entries(this.migrations)
        .filter(([version, _]) => {
          // only run migrations for new versions
          return (source.model_version ?? "") < version;
        })
        .reduce((source, [version, migrator]) => {
          const out = migrator(source);
          out.model_version = version;
          Object.assign(source, out);
          return out;
        }, source)
    );
  }

  static get latest_version() {
    const versions = Object.keys(this.migrations).sort();
    return versions[versions.length - 1];
  }
}
