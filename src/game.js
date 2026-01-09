import { dialogueData, scaleFactor } from "./constants.js";
import { k } from "./kaplayCtx.js";
import { displayDialogue, setCamScale } from "./utils";

k.loadSprite("spritesheet", "./spritesheet.png", {
  sliceX: 39,
  sliceY: 31,
  anims: {
    "idle-down": 944,
    "walk-down": { from: 944, to: 947, loop: true, speed: 8 },
    "idle-side": 983,
    "walk-side": { from: 983, to: 986, loop: true, speed: 8 },
    "idle-up": 1022,
    "walk-up": { from: 1022, to: 1025, loop: true, speed: 8 },
  },
});

k.loadSprite("map", "./map.png");
k.loadSprite("town-map", "./town_map.png");

const BASE_BG_COLOR = "#311047";
const TOWN_BG_COLOR = "#7dbb5a";
const TILE_SIZE = 16 * scaleFactor;
const TOWN_MAP_WIDTH = 352;
const TOWN_MAP_HEIGHT = 288;

function createPlayer() {
  return k.make([
    k.sprite("spritesheet", { anim: "idle-down" }),
    k.area({
      shape: new k.Rect(k.vec2(0, 3), 10, 10),
    }),
    k.body(),
    k.anchor("center"),
    k.pos(),
    k.scale(scaleFactor),
    {
      speed: 250,
      direction: "down",
      isInDialogue: false,
    },
    "player",
  ]);
}

function setupPlayerControls(player, register) {
  register(
    k.onMouseDown((mouseBtn) => {
      if (mouseBtn !== "left" || player.isInDialogue) return;

      const worldMousePos = k.toWorld(k.mousePos());
      player.moveTo(worldMousePos, player.speed);

      const mouseAngle = player.pos.angle(worldMousePos);

      const lowerBound = 50;
      const upperBound = 125;

      if (
        mouseAngle > lowerBound &&
        mouseAngle < upperBound &&
        player.getCurAnim() !== "walk-up"
      ) {
        player.play("walk-up");
        player.direction = "up";
        return;
      }

      if (
        mouseAngle < -lowerBound &&
        mouseAngle > -upperBound &&
        player.getCurAnim() !== "walk-down"
      ) {
        player.play("walk-down");
        player.direction = "down";
        return;
      }

      if (Math.abs(mouseAngle) > upperBound) {
        player.flipX = false;
        if (player.getCurAnim() !== "walk-side") player.play("walk-side");
        player.direction = "right";
        return;
      }

      if (Math.abs(mouseAngle) < lowerBound) {
        player.flipX = true;
        if (player.getCurAnim() !== "walk-side") player.play("walk-side");
        player.direction = "left";
      }
    })
  );

  function stopAnims() {
    if (player.direction === "down") {
      player.play("idle-down");
      return;
    }
    if (player.direction === "up") {
      player.play("idle-up");
      return;
    }

    player.play("idle-side");
  }

  register(k.onMouseRelease(stopAnims));

  register(
    k.onKeyRelease(() => {
      stopAnims();
    })
  );

  register(
    k.onKeyDown(() => {
      const keyMap = [
        k.isKeyDown("right"),
        k.isKeyDown("left"),
        k.isKeyDown("up"),
        k.isKeyDown("down"),
      ];

      let nbOfKeyPressed = 0;
      for (const key of keyMap) {
        if (key) {
          nbOfKeyPressed++;
        }
      }

      if (nbOfKeyPressed > 1) return;

      if (player.isInDialogue) return;
      if (keyMap[0]) {
        player.flipX = false;
        if (player.getCurAnim() !== "walk-side") player.play("walk-side");
        player.direction = "right";
        player.move(player.speed, 0);
        return;
      }

      if (keyMap[1]) {
        player.flipX = true;
        if (player.getCurAnim() !== "walk-side") player.play("walk-side");
        player.direction = "left";
        player.move(-player.speed, 0);
        return;
      }

      if (keyMap[2]) {
        if (player.getCurAnim() !== "walk-up") player.play("walk-up");
        player.direction = "up";
        player.move(0, -player.speed);
        return;
      }

      if (keyMap[3]) {
        if (player.getCurAnim() !== "walk-down") player.play("walk-down");
        player.direction = "down";
        player.move(0, player.speed);
      }
    })
  );
}

function setupCamera(player, register) {
  setCamScale(k);
  register(
    k.onResize(() => {
      setCamScale(k);
    })
  );
  register(
    k.onUpdate(() => {
      k.setCamPos(player.worldPos().x, player.worldPos().y - 100);
    })
  );
}

export function initGame() {
  if (initGame._api) return initGame._api;

  const controllers = [];
  let paused = false;
  let activePlayer = null;
  let canvasSized = false;

  const register = (controller) => {
    if (controller) controllers.push(controller);
    return controller;
  };

  if (!canvasSized) {
    k.canvas.width = 960;
    k.canvas.height = 540;
    canvasSized = true;
  }

  k.setBackground(k.Color.fromHex(BASE_BG_COLOR));

  k.scene("main", async () => {
    const mapData = await (await fetch("./map.json")).json();
    const layers = mapData.layers;

    const map = k.add([
      k.sprite("map"),
      k.pos(0),
      k.scale(scaleFactor),
    ]);

    const player = createPlayer();
    activePlayer = player;

    for (const layer of layers) {
      if (layer.name === "boundaries") {
        for (const boundary of layer.objects) {
          map.add([
            k.area({
              shape: new k.Rect(k.vec2(0), boundary.width, boundary.height),
            }),
            k.body({ isStatic: true }),
            k.pos(boundary.x, boundary.y),
            boundary.name,
          ]);

          if (boundary.name === "exit") {
            register(
              player.onCollide("exit", () => {
                if (player.isInDialogue) return;
                player.isInDialogue = true;
                k.go("town");
              })
            );
          } else if (boundary.name) {
            register(
              player.onCollide(boundary.name, () => {
                player.isInDialogue = true;
                displayDialogue(dialogueData[boundary.name], () => {
                  player.isInDialogue = false;
                });
              })
            );
          }
        }
        continue;
      }

      if (layer.name === "spawnpoints") {
        for (const entity of layer.objects) {
          if (entity.name === "player") {
            player.pos = k.vec2(
              (map.pos.x + entity.x) * scaleFactor,
              (map.pos.y + entity.y) * scaleFactor
            );
            k.add(player);
            continue;
          }
        }
      }
    }

    setupCamera(player, register);
    setupPlayerControls(player, register);
  });

  k.scene("town", () => {
    k.setBackground(k.Color.fromHex(TOWN_BG_COLOR));

    const townWidth = TOWN_MAP_WIDTH * scaleFactor;
    const townHeight = TOWN_MAP_HEIGHT * scaleFactor;

    k.add([
      k.sprite("town-map"),
      k.pos(0, 0),
      k.scale(scaleFactor),
    ]);

    function addTownCollider(tx, ty, tw, th) {
      return k.add([
        k.area({
          shape: new k.Rect(k.vec2(0), tw * TILE_SIZE, th * TILE_SIZE),
        }),
        k.body({ isStatic: true }),
        k.pos(tx * TILE_SIZE, ty * TILE_SIZE),
      ]);
    }

    addTownCollider(-1, -1, 24, 1);
    addTownCollider(-1, 18, 24, 1);
    addTownCollider(-1, -1, 1, 20);
    addTownCollider(22, -1, 1, 20);

    addTownCollider(8, 2, 7, 4);
    addTownCollider(16, 2, 4, 4);
    addTownCollider(4, 2, 3, 5);
    addTownCollider(9, 8, 3, 3);
    addTownCollider(0, 10, 6, 3);
    addTownCollider(1, 13, 4, 3);
    addTownCollider(9, 10, 7, 4);
    addTownCollider(10, 13, 5, 2);

    const homeGate = k.add([
      k.area({
        shape: new k.Rect(k.vec2(0), TILE_SIZE * 4, TILE_SIZE * 1.5),
      }),
      k.pos(TILE_SIZE * 11, TILE_SIZE * 16.5),
      "homeGate",
    ]);

    k.add([
      k.rect(TILE_SIZE * 4, TILE_SIZE * 1.5),
      k.pos(TILE_SIZE * 9, TILE_SIZE * 16.5),
      k.color(k.Color.fromHex("#3b2b20")),
      k.opacity(0.2),
    ]);

    const player = createPlayer();
    activePlayer = player;
    player.pos = k.vec2(townWidth / 2, townHeight - TILE_SIZE * 3);
    k.add(player);

    register(
      player.onCollide("homeGate", () => {
        if (player.isInDialogue) return;
        player.isInDialogue = true;
        k.go("main");
      })
    );

    setupCamera(player, register);
    setupPlayerControls(player, register);
  });

  k.go("main");

  const api = {
    canvas: k.canvas,
    togglePause: () => {
      api.setPaused(!paused);
    },
    setPaused: (next) => {
      paused = next;
      controllers.forEach((controller) => {
        controller.paused = paused;
      });
      if (paused && activePlayer) {
        activePlayer.moveTo(activePlayer.pos, 0);
      }
    },
    isPaused: () => paused,
  };

  initGame._api = api;
  return api;
}
