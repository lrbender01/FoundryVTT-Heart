# Heart System

![Foundry v13](https://img.shields.io/badge/foundry-v13-green)

This is the source code the [Heart - The City Beneath](https://rowanrookanddecard.com/product/heart-the-city-beneath-rpg/) RPG written for [FoundryVTT](https://foundryvtt.com/).

This has been re-written from the ground up to work better for foundry v13.

## What's new?

* [Custom Rolling Grammar](#custom-rolling-grammar) (e.g. `/roll delve + technology`)
* UI elements to help construct the above!
* Simplified Character Sheet
* Lots of under-the-hood changes

## Features

### Custom Rolling Grammar

New to this version is the ability to roll using a slightly more natural language.

* Heart rolls
  * `/roll [skill] + [domain]` : for a normal heart roll
    * e.g. `/roll delve + technology`
  * `/roll [skill] + [domain] + mastery` : if you have mastery, either from help or a knack
    * e.g. `/roll delve + technology + mastery`
  * `/roll [difficulty] [skill] + [domain]` : 
    * e.g. `/roll risky delve + technology` or `/roll dangerous delve + technology`
* Stress rolls
  * `/roll [dice] [resistance] stress` : for a normal stress roll
    * e.g. `/roll d6 blood stress`
  * `/roll critical [dice] [resistance] stress` : if you had a critical failure
    * e.g. `/roll critical d6 blood stress`
* Fallout rolls
  * `/roll [resistance] fallout`
    * e.g. `/roll blood fallout`
  
# How do I make changes?

Firstly, you'll need to clone the repo. If you aren't familiar with doing that, please [read the docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository).

Once you've got the repo available on your local machine, install the node assets and run the required build rules:

```
npm ci
npm run build-grammar 
npm run build-css 
```

If you're doing a lot of SCSS changes, it might be convenient to run `npm run watch-css`, which will rebuild all the CSS files whenever a change is saved.

With that done, you should be able to modify whatever files you like, and (assuming you have placed/linked the system in the correct directory) changes will be available on a refresh.