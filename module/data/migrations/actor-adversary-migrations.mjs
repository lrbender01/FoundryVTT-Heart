import DifficultyParser from "../../grammars/heart-difficulty.mjs";

function migration000(source) {
  const names = source.names;
  const descriptors = source.descriptors;
  const motivation = source.motivation;

  let difficulty = "";
  try {
    const out = DifficultyParser.parse(source.difficulty);
    difficulty = out.difficulty.key;
  } catch(err) {};

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
