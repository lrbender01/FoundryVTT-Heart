import { maybeMigrateTranslation } from "./common.mjs";

function migration000(source) {
  const description = maybeMigrateTranslation(source.description);
  return {
    description,
  };
}

export default {
  "000": migration000,
};