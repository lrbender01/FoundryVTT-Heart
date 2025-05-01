export default class HeartStressRollParser {
  constructor(formula) {
    this.formula = formula;
  }

  _onExpression(critical, resistance, dice, error) {
    return {
      critical: critical !== null,
      resistance,
      dice,
    };
  }

  _onDiceTerm(number, faces, flavor, formula, error) {
    return { class: "DiceTerm", formula, number, faces, evaluated: false, options: { flavor } };
  }
}
