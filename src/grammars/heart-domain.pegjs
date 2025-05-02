Expression = _ domain:DomainTerm? _ {
  return {domain, text: text(), error};
}

DomainTerm = CursedTerm / DesolateTerm / HavenTerm / OccultTerm / ReligionTerm / TechnologyTerm / WarrenTerm / WildTerm 
CursedTerm = ("cursed"i ${HEART.Domain.types.cursed}) { return { key: "cursed", value: text() } }
DesolateTerm = ("desolate"i ${HEART.Domain.types.desolate}) { return { key: "desolate", value: text() } }
HavenTerm = ("haven"i ${HEART.Domain.types.haven}) { return { key: "haven", value: text() } }
OccultTerm = ("occult"i ${HEART.Domain.types.occult}) { return { key: "occult", value: text() } }
ReligionTerm = ("religion"i ${HEART.Domain.types.religion}) { return { key: "religion", value: text() } }
TechnologyTerm = ("technology"i ${HEART.Domain.types.technology}) { return { key: "technology", value: text() } }
WarrenTerm = ("warren"i ${HEART.Domain.types.warren}) { return { key: "warren", value: text() } }
WildTerm = ("wild"i ${HEART.Domain.types.wild}) { return { key: "wild", value: text() } }

_ "whitespace" = [ ]*