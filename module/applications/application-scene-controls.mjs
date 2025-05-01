export class HeartSceneControls extends SceneControls {
  _getControlButtons() {
    const out = super._getControlButtons();
    out.splice(0, 0, {
      name: "heart",
      title: "HEART.CONTROLS.Group",
      icon: "fa-solid fa-heart-crack",
      layer: "heart",
      tools: [
        {
          name: "roll",
          title: "HEART.Application.roll-helper.title",
          icon: "fa-solid fa-dice-d20",
          // visible: isGM,
          onClick: () =>
            new game.heart.HeartRollHelperApplication().render(true),
          button: true,
        },
        {
          name: "stress",
          title: "HEART.Application.stress-roll-helper.title",
          icon: "fa-solid fa-person-harassing",
          // visible: isGM,
          onClick: () =>
            new game.heart.HeartStressRollHelperApplication().render(true),
          button: true,
        },
        {
          name: "fallout",
          title: "HEART.Application.fallout-roll-helper.title",
          icon: "fa-solid fa-radiation",
          onClick: () =>
            new game.heart.HeartFalloutRollHelperApplication().render(true),
          button: true,
        },
      ],
    });
    return out;
  }

  _onClickLayer(event) {
    try {
      super._onClickLayer(event);
    } catch (err) {}
  }
}
