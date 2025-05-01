import { maybeMigrateTranslation } from "./common.mjs";

function migration000(source) {
  let description = maybeMigrateTranslation(source.description);
  const type = source.type;
  const resistance = source.resistance;

  return {
    description,
    resistance,
    type,
  };
}

export default {
  "000": migration000,
};
