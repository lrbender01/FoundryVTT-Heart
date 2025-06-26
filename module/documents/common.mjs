export function HeartDocumentMixin(BaseDocument) {
  class HeartDocument extends BaseDocument {
    async activateEquipmentGroup(equipment_group) {
      const groups = this.getEquipmentGroups();
      const group = groups[equipment_group];
      if (group === undefined) {
        ui.notifcations.warn(`Equipment group "${equipment_group} not found.`);
        return;
      }
      await this.setFlag("heart", "equipment_group", "");
      return Promise.all(
        group.map((item) => {
          return item.setFlag("heart", "active", true);
        })
      );
    }

    async deactivateEquipmentGroup(equipment_group) {
      const groups = this.getEquipmentGroups();
      const group = groups[equipment_group];
      if (group === undefined) {
        ui.notifcations.warn(`Equipment group "${equipment_group} not found.`);
        return;
      }
      await this.setFlag("heart", "equipment_group", "");
      return Promise.all(
        group.map((item) => {
          return item.setFlag("heart", "active", false);
        })
      );
    }
  };
  return HeartDocument;
}
