function migration000(source) {
  const domains = [];
  const tier = parseInt(source.tier) || 1;
  const resistance = source.resistance || 10;
  const description = source.description;
  const special_rules = source.specialRules;
  const base_stress = source.stress;
  const potential_plots = source.potentialPlots;
  return {
    domains,
    tier,
    resistance,
    description,
    special_rules,
    base_stress,
    potential_plots,
  };
}

export default {
  "000": migration000,
};
