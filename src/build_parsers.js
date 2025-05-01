import { build } from "moduloze";

import peg from "pegjs";
import { readFileSync, writeFileSync, globSync } from "fs";

function flatten(ob) {
  var toReturn = {};

  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;

    if (typeof ob[i] == "object" && ob[i] !== null) {
      var flatObject = flatten(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;

        toReturn[i + "." + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

const translations = globSync("lang/*/*.json", {
  excludes: (path) => path.endsWith(".items.json"),
}).reduce((out, path) => {
  const locale = path.split("/")[1];
  const content = readFileSync(path, "utf8");
  out[locale] = flatten(JSON.parse(content));
  return out;
}, {});

globSync("src/grammars/*.pegjs").forEach((path) => {
  let grammar_content = readFileSync(path, "utf8");

  const matches = grammar_content.match(/\${(.*?)}/g);
  matches.forEach((match) => {
    const key = match.slice(2, -1);
    const output = [""];
    Object.values(translations).forEach((translation) => {
      const tr = translation[key];
      if (tr !== undefined) {
        output.push(`"${tr}"`);
      }
    });
    const replacement = output.join(" / ");

    grammar_content = grammar_content.replace(match, replacement);
  });

  const parser = peg.generate(grammar_content, {
    format: "commonjs",
    output: "source",
  });

  const output_path = path.replace('src/grammars', 'module/rolls').replace('.pegjs', '.mjs');

  const { esm } = build(
    { buildESM: true },
    path,
    parser,
    {
      [path]: "Parser",
    }
  );

  writeFileSync(output_path, esm.code);
});