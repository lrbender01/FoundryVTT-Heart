function migration000(source) {
  const names = source.names;
  const descriptors = source.descriptors;
  const motivation = source.motivation;
  const difficulty = source.difficulty.toLowerCase();
  const resistance = parseInt(source.resistance) || 0;
  const protection = parseInt(source.protection) || 0;
  const special = source.special;
  const domains = source.domains;
  return {
    names,
    descriptors,
    motivation,
    difficulty,
    resistance,
    protection,
    special,
    domains,
  };
}

export default {
  "000": migration000,
};
