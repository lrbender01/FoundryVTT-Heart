import { CharacterSheet } from "./character.js";

export function registerActorSheets() {
  const { Actors } = foundry.documents.collections;
  Actors.registerSheet("heart", CharacterSheet, {types: ["character"]});
}
