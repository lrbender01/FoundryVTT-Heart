{
  const Parser = options.parser ?? CONFIG.HEART.heart_stress_roll_parser;
  const parser = new Parser(input);
}

Expression = _ critical:CriticalTerm? _ dice:DiceTerm _ resistance:ResistanceTerm _ StressTerm _ {
  return parser._onExpression(critical, resistance, dice, text(), error);
}

StressTerm = "stress"i ${HEART.StressRoll.formula}
CriticalTerm = "critical"i ${HEART.StressRoll.critical}

ResistanceTerm = BloodTerm / EchoTerm / FortuneTerm / MindTerm / SuppliesTerm
BloodTerm = ("blood"i ${HEART.Resistance.types.blood}) { return { key: "blood", value: text() } }
EchoTerm = ("echo"i ${HEART.Resistance.types.echo}) { return { key: "echo", value: text() } }
FortuneTerm = ("fortune"i ${HEART.Resistance.types.fortune}) { return { key: "echo", value: text() } }
MindTerm = ("mind"i ${HEART.Resistance.types.mind}) { return { key: "mind", value: text() } }
SuppliesTerm = ("supplies"i ${HEART.Resistance.types.supplies}) { return { key: "supplies", value: text() } }

DiceTerm = number:Constant? [dD] faces:Constant flavor:Flavor? {
  return parser._onDiceTerm(number, faces, flavor, text());
}

Constant = _ [0-9]+ _ {
  return Number(text());
}
Flavor = "[" [^[\]]+ "]"

_ "whitespace" = [ ]*