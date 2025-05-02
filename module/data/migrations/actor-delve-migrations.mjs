import DomainParser from "../../grammars/heart-domain.mjs";

function migration000(source) {
  const route = source.route || "";
  const tiers = [parseInt(source.tier) || 1];
    const domains = source.domains.split(/[, ]+/).map((domain) => {
      try {
        return DomainParser.parse(domain).domain.key;
      } catch (err) {
        return null
      }
    }).filter(x => x !== null);
  let stress = source.stress ?? 6;
  if (stress == 0) stress = 6;

  const resistance = parseInt(source.resistance) || 0;
  const description = source.description ?? "";
  const events = source.events ?? "";
  const connection = source.connection ?? "";
  const notes = source.notes ?? "";

  return {
    route,
    tiers,
    domains,
    stress,
    resistance,
    description,
    events,
    connection,
    notes,
  };
}

export default {
  "000": migration000,
};
