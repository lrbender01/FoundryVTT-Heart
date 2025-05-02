{
  const Parser = options.parser ?? CONFIG.HEART.heart_roll_parser;
  const parser = new Parser(input);
}

Expression = _ difficulty:DifficultyTerm? _ domain:DomainTerm _ JoinTerm _ skill:(SkillTerm) has_mastery:(_ JoinTerm _ mastery:MasteryTerm)? _ {
  return parser._onExpression(domain, skill, has_mastery, difficulty, text(), error);
}

JoinTerm = "+"

DomainTerm = CursedTerm / DesolateTerm / HavenTerm / OccultTerm / ReligionTerm / TechnologyTerm / WarrenTerm / WildTerm 
CursedTerm = ("cursed"i ${HEART.Domain.types.cursed}) { return { key: "cursed", value: text() } }
DesolateTerm = ("desolate"i ${HEART.Domain.types.desolate}) { return { key: "desolate", value: text() } }
HavenTerm = ("haven"i ${HEART.Domain.types.haven}) { return { key: "haven", value: text() } }
OccultTerm = ("occult"i ${HEART.Domain.types.occult}) { return { key: "occult", value: text() } }
ReligionTerm = ("religion"i ${HEART.Domain.types.religion}) { return { key: "religion", value: text() } }
TechnologyTerm = ("technology"i ${HEART.Domain.types.technology}) { return { key: "technology", value: text() } }
WarrenTerm = ("warren"i ${HEART.Domain.types.warren}) { return { key: "warren", value: text() } }
WildTerm = ("wild"i ${HEART.Domain.types.wild}) { return { key: "wild", value: text() } }

SkillTerm = CompelTerm / DelveTerm / DiscernTerm / EndureTerm / KillTerm / EvadeTerm / HuntTerm / MendTerm / SneakTerm
CompelTerm = ("compel"i ${HEART.Skill.types.compel}) { return { key: "compel", value: text() } }
DelveTerm = ("delve"i ${HEART.Skill.types.delve}) { return { key: "delve", value: text() } }
DiscernTerm = ("discern"i ${HEART.Skill.types.discern}) { return { key: "discern", value: text() } }
EndureTerm = ("endure"i ${HEART.Skill.types.endure}) { return { key: "endure", value: text() } }
KillTerm = ("kill"i ${HEART.Skill.types.kill}) { return { key: "kill", value: text() } }
EvadeTerm = ("evade"i ${HEART.Skill.types.evade}) { return { key: "evade", value: text() } }
HuntTerm = ("hunt"i ${HEART.Skill.types.hunt}) { return { key: "hunt", value: text() } }
MendTerm = ("mend"i ${HEART.Skill.types.mend}) { return { key: "mend", value: text() } }
SneakTerm = ("sneak"i ${HEART.Skill.types.sneak}) { return { key: "sneak", value: text() } }

MasteryTerm = "mastery"i ${HEART.Roll.mastery}

DifficultyTerm = StandardTerm / RiskyTerm / DangerousTerm
StandardTerm = ("standard"i ${HEART.Roll.difficulty.types.standard})  { return { key: "standard", value: text() } }
RiskyTerm = ("risky"i ${HEART.Roll.difficulty.types.risky}) { return { key: "risky", value: text() } }
DangerousTerm = ("dangerous"i ${HEART.Roll.difficulty.types.dangerous}) { return { key: "dangerous", value: text() } }

_ "whitespace" = [ ]*