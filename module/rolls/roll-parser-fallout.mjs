export default class HeartFalloutRollParser {
  constructor(formula) {
    this.formula = formula;
  }

  _onExpression(resistance, formula, error) {
    return { resistance, formula };
  }
}
