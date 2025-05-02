Expression = _ difficulty:DifficultyTerm? _ {
  return {difficulty, text: text(), error};
}

DifficultyTerm = StandardTerm / RiskyTerm / DangerousTerm
StandardTerm = ("standard"i ${HEART.Roll.difficulty.types.standard})  { return { key: "standard", value: text() } }
RiskyTerm = ("risky"i ${HEART.Roll.difficulty.types.risky}) { return { key: "risky", value: text() } }
DangerousTerm = ("dangerous"i ${HEART.Roll.difficulty.types.dangerous}) { return { key: "dangerous", value: text() } }

_ "whitespace" = [ ]*