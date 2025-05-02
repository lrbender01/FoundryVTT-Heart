{
  const Parser = options.parser ?? CONFIG.HEART.heart_fallout_roll_parser;
  const parser = new Parser(input);
}

Expression = _ resistance:ResistanceTerm _ FalloutTerm _ {
  return parser._onExpression(resistance, text(), error);
}

FalloutTerm = "fallout"i ${HEART.FalloutRoll.formula}

ResistanceTerm = BloodTerm / EchoTerm / FortuneTerm / MindTerm / SuppliesTerm 
BloodTerm = ("blood"i ${HEART.Resistance.types.blood}) { return { key: "blood", value: text() }; }
EchoTerm = ("echo"i ${HEART.Resistance.types.echo}) { return { key: "echo", value: text() }; }
FortuneTerm = ("fortune"i ${HEART.Resistance.types.fortune}) { return { key: "echo", value: text() }; }
MindTerm = ("mind"i ${HEART.Resistance.types.mind}) { return { key: "mind", value: text() }; }
SuppliesTerm = ("supplies"i ${HEART.Resistance.types.supplies}) {return { key: "supplies", value: text() }; }

_ "whitespace" = [ ]*