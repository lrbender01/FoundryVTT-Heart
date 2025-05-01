export default class HeartRollParser {
  constructor(formula) {
    this.formula = formula;
  }

  _onExpression(domain, skill, has_mastery, has_difficulty, formula, error) {
    return {
      domain,
      skill,
      has_mastery: has_mastery !== null,
      difficulty: has_difficulty === null ? null : has_difficulty[3],
    };
  }
}
