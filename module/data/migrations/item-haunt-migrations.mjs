function migration000(source) {
  const die_size_conversions = {
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10,
    d12: 12,
  };
  let die_size = die_size_conversions[source.die_size || "d4"];
  const resistances = source.resistances || [];

  return {
    die_size,
    resistances
  }
}

export default {
  "000": migration000,
};
