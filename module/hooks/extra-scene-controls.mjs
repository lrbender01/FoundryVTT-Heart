export function getSceneControlButtons(controls) {
  controls.heart = {
    active: false,
    activeTool: "",
    icon: "fa-solid fa-heart-crack",
    layer: "heart",
    name: "heart",
    onChange: (event, active) => {
    },
    order: 0,
    title: "HEART.CONTROLS.Group",
    tools: {
      roll: {
        order: 1,
        name: "roll",
        title: "HEART.Application.roll-helper.title",
        icon: "fa-solid fa-dice-d20",
        // visible: isGM,
        onChange: (event, active) => {
          if (active) new game.heart.HeartRollHelperApplication().render(true);
        },
        button: true,
        visible: true,
      },
      stress: {
        order: 2,
        name: "stress",
        title: "HEART.Application.stress-roll-helper.title",
        icon: "fa-solid fa-person-harassing",
        // visible: isGM,
        onChange: (event, active) => {
          if (active)
            new game.heart.HeartStressRollHelperApplication().render(true);
        },
        button: true,
        visible: true,
      },
      fallout: {
        order: 3,
        name: "fallout",
        title: "HEART.Application.fallout-roll-helper.title",
        icon: "fa-solid fa-radiation",
        onChange: (event, active) => {
          if (active)
            new game.heart.HeartFalloutRollHelperApplication().render(true);
        },
        button: true,
        visible: true,
      },
    },
    visible: true,
  };
}
