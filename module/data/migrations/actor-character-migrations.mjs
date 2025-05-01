import { maybeMigrateTranslation } from "./common.mjs";

function migration000(source) {
  const notes = maybeMigrateTranslation(source.notes);
  const resistances = source.resistances;
  const domains = source.domains;
  const skills = source.skills;

  const type = source.type;

  return { notes, type, resistances, domains, skills };
}

export default {
  "000": migration000,
};
