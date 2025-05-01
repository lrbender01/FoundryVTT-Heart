export const HEART = {};

/**
 * The set of Ability Scores used within the system.
 * @type {Object}
 */

HEART.ability_types = {
  core: "HEART.common.core",
  minor: "HEART.common.minor",
  major: "HEART.common.major",
  zenith: "HEART.common.zenith",
};

HEART.beat_types = {
  minor: "HEART.common.minor",
  major: "HEART.common.major",
  zenith: "HEART.common.zenith",
};

HEART.resistances = {
  blood: "HEART.Resistance.types.blood",
  mind: "HEART.Resistance.types.mind",
  echo: "HEART.Resistance.types.echo",
  fortune: "HEART.Resistance.types.fortune",
  supplies: "HEART.Resistance.types.supplies",
};

HEART.skills = {
  compel: "HEART.Skill.types.compel",
  delve: "HEART.Skill.types.delve",
  discern: "HEART.Skill.types.discern",
  endure: "HEART.Skill.types.endure",
  evade: "HEART.Skill.types.evade",
  hunt: "HEART.Skill.types.hunt",
  kill: "HEART.common.kill",
  mend: "HEART.Skill.types.mend",
  sneak: "HEART.Skill.types.sneak",
};

HEART.domains = {
  cursed: "HEART.Domain.types.cursed",
  desolate: "HEART.Domain.types.desolate",
  haven: "HEART.Domain.types.haven",
  occult: "HEART.Domain.types.occult",
  religion: "HEART.Domain.types.religion",
  technology: "HEART.Domain.types.technology",
  warren: "HEART.Domain.types.warren",
  wild: "HEART.Domain.types.wild",
};

HEART.die_sizes = {
  4: "HEART.DieSize.types.4",
  6: "HEART.DieSize.types.6",
  8: "HEART.DieSize.types.8",
  10: "HEART.DieSize.types.10",
  12: "HEART.DieSize.types.12",
};

HEART.equipment_types = {
  miscellaneous: "HEART.Item.equipment.types.miscellaneous",
  delve: "HEART.Item.equipment.types.delve",
  kill: "HEART.common.kill",
  mend: "HEART.Item.equipment.types.mend",
};

HEART.fallout_types = {
  none: "HEART.Item.fallout.types.none",
  minor: "HEART.common.minor",
  major: "HEART.common.major",
  critical: "HEART.Item.fallout.types.critical",
};

HEART.roll_result_types = {
  critical_failure: "HEART.Roll.types.critical_failure",
  failure: "HEART.Roll.types.failure",
  success_at_a_cost: "HEART.Roll.types.success_at_a_cost",
  success: "HEART.Roll.types.success",
  critical_success: "HEART.Roll.types.critical_success",
};

HEART.roll_difficulty_types = {
  standard: "HEART.Roll.difficulty.types.standard",
  risky: "HEART.Roll.difficulty.types.risky",
  dangerous: "HEART.Roll.difficulty.types.dangerous",
};

HEART.tier_types = {
  0: "0",
  1: "1",
  2: "2",
  3: "3",
  4: "HEART.Tier.fracture",
  5: "HEART.Tier.rogue",
};
