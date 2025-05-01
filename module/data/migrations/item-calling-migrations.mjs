import { migrateLegacyItem, maybeMigrateTranslation } from "./common.mjs";

function migration000(source) {
  let description = maybeMigrateTranslation(source.description);
  const items = [];
  const questions = [];

  Object.values(source.children ?? {}).forEach((child) => {
    items.push(migrateLegacyItem(child));
  });

  Object.values(source.questions ?? {}).forEach((obj) => {
    questions.push({
      question: maybeMigrateTranslation(obj.question),
      answer: obj.answer ?? "",
    });
  });

  return {
    description,
    questions,
    items: items,
  };
}

export default {
  "000": migration000,
};
