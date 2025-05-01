function migration000(source) {
  const route = source.route || "";
  const tiers = [parseInt(source.tier) || 1];
  const domains = [];
  const stress = source.stress ?? 6;
  const resistance = parseInt(source.resistance) || 0;
  const description = source.description ?? "";
  const events = source.events ?? "";
  const connection = source.connection ?? "";
  const notes = source.notes ?? "";

  return {
    route,
    tiers,
    domains,
    stress,
    resistance,
    description,
    events,
    connection,
    notes,
  };
}

export default {
  "000": migration000,
};
