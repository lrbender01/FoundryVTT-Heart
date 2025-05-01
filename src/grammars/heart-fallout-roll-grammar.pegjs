{
  const Parser = options.parser ?? CONFIG.HEART.heart_fallout_roll_parser;
  const parser = new Parser(input);
}

Expression = _ resistance:ResistanceTerm _ FalloutTerm _ {
  return parser._onExpression(resistance, text(), error);
}

FalloutTerm = "fallout" ${HEART.FalloutRoll.formula}

ResistanceTerm = BloodTerm / EchoTerm / FortuneTerm / MindTerm / SuppliesTerm 
BloodTerm = ("blood" ${HEART.Resistance.types.blood}) { return { key: "blood", value: text() }; }
EchoTerm = ("echo" ${HEART.Resistance.types.echo}) { return { key: "echo", value: text() }; }
FortuneTerm = ("fortune" ${HEART.Resistance.types.fortune}) { return { key: "echo", value: text() }; }
MindTerm = ("mind" ${HEART.Resistance.types.mind}) { return { key: "mind", value: text() }; }
SuppliesTerm = ("supplies" ${HEART.Resistance.types.supplies}) {return { key: "supplies", value: text() }; }

_ "whitespace" = [ ]*