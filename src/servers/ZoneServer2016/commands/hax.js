import { generateCharacterId } from "../../../utils/utils";
const _ = require("lodash");
const debug = require("debug")("zonepacketHandlers");
import fs from "fs";

const hax = {
  tp: function (server, client, args) {
    if (args.length < 4) {
      server.sendChatText(client, "Need 3 args: position x, y, z", false);
      return;
    }
    const location = {
      // unknownWord1: 50,
      position: [args[1], args[2], args[3], 1],
      rotation: [10, 20, 30, 1],
      unknownBool1: true,
      unknownByte1: 100,
      unknownBool2: true,
    };
    server.sendData(client, "ClientUpdate.UpdateLocation", location);
    const SendZoneDetails_packet = {
      zoneName: "Z1",
      unknownBoolean1: true,
      zoneType: 4,
      //skyData: weather,
      skyData: {},
      zoneId1: 3905829720,
      zoneId2: 3905829720,
      nameId: 7699,
      unknownBoolean2: true,
      unknownBoolean3: true,
    };
    server.sendData(client, "SendZoneDetails", SendZoneDetails_packet); // needed or screen is black, maybe use skyChanged instead?
    server.sendData(client, "ClientBeginZoning", {}); // needed or no trees / foliage spawned on tp
  },

  forceNight: function (server, client, args) {
    server.forceTime(1615062252322);
    server.sendChatText(
      client,
      "[Deprecated] This command will be removed in futher updates",
      true
    );
    server.sendChatText(
      client,
      "Use /hax time {choosen hour as float} instead",
      false
    );
    server.sendChatText(client, "Will force Night time on next sync...", false);
  },
  forceDay: function (server, client, args) {
    server.forceTime(971172000000);
    server.sendChatText(
      client,
      "[Deprecated] This command will be removed in futher updates",
      true
    );
    server.sendChatText(
      client,
      "Use /hax time {choosen hour as float} instead",
      false
    );
    server.sendChatText(client, "Will force Day time on next sync...", false);
  },
  time: function (server, client, args) {
    const choosenHour = Number(args[1]);
    if (choosenHour < 0) {
      server.sendChatText(client, "You need to specify an hour to set !");
      return;
    }
    server.forceTime(choosenHour * 3600 * 1000);
    server.sendChatText(
      client,
      `Will force time to be ${
        choosenHour % 1 >= 0.5
          ? choosenHour.toFixed(0) - 1
          : choosenHour.toFixed(0)
      }:${
        choosenHour % 1 === 0
          ? "00"
          : (((choosenHour % 1) * 100 * 60) / 100).toFixed(0)
      } on next sync...`,
      true
    );
  },
  realTime: function (server, client, args) {
    server.removeForcedTime();
    server.sendChatText(client, "Game time is now based on real time", true);
  },
  spamOffroader: function (server, client, args) {
    for (let index = 0; index < 150; index++) {
      const vehicleData = {
        npcData: {
          guid: generateCharacterId(),
          transientId: 1,
          unknownString0: "",
          nameId: 12,
          unknownDword2: 0,
          unknownDword3: 0,
          unknownByte1: 0,
          modelId: 7225,
          scale: [1, 1, 1, 1],
          unknownString1: "",
          unknownString2: "",
          unknownDword5: 0,
          unknownDword6: 0,
          position: client.character.state.position,
          unknownVector1: [0, 0, 0, 1],
          rotation: [0, 0, 0, 1],
          unknownDword7: 0,
          unknownFloat1: 3,
          unknownString3: "",
          unknownString4: "",
          unknownString5: "",
          vehicleId: 3,
          unknownDword9: 0,
          npcDefinitionId: 2,
          unknownByte2: 2,
          profileId: 3,
          unknownBoolean1: false,
          unknownData1: {
            unknownByte1: 16,
            unknownByte2: 9,
            unknownByte3: 0,
          },
          unknownByte6: 0,
          unknownDword11: 0,
          unknownGuid1: "0x0000000000000000",
          unknownData2: {
            unknownGuid1: "0x0000000000000000",
          },
          unknownDword12: 0,
          unknownDword13: 0,
          unknownDword14: 0,
          unknownByte7: 0,
          unknownArray1: [],
          array5: [{ unknown1: 0 }],
          array17: [{ unknown1: 0 }],
          array18: [{ unknown1: 0 }],
        },
        unknownGuid1: generateCharacterId(),
        unknownDword1: 0,
        unknownDword2: 0,
        positionUpdate: server.createPositionUpdate(
          client.character.state.position,
          [0, 0, 0, 0]
        ),
        unknownString1: "mdr",
      };

      server.sendData(client, "AddLightweightVehicle", vehicleData);
    }
  },
  spawnObject: function (server, client, args) {
    const guid = server.generateGuid();
    //const transientId = server.getTransientId(client, guid);
    if (!args[1]) {
      server.sendChatText(client, "[ERROR] You need to specify a model id !");
      return;
    }
    const choosenModelId = Number(args[1]);
    const obj = {
      guid: guid,
      transientId: choosenModelId,
      position: [
        client.character.state.position[0],
        client.character.state.position[1],
        client.character.state.position[2],
      ],
      rotation: [
        client.character.state.rotation[0],
        client.character.state.rotation[1],
        client.character.state.rotation[2],
      ],
    };
    server.sendData(client, "AddProxiedObject", obj);
    // server.obj[guid] = obj; // save npc
  },
  spawnNpcModel: function (server, client, args) {
    const guid = server.generateGuid();
    const transientId = server.getTransientId(client, guid);
    if (!args[1]) {
      server.sendChatText(client, "[ERROR] You need to specify a model id !");
      return;
    }
    const choosenModelId = Number(args[1]);
    const characterId = generateCharacterId();
    const npc = {
      characterId: characterId,
      guid: guid,
      transientId: transientId,
      modelId: choosenModelId,
      position: [
        client.character.state.position[0],
        client.character.state.position[1],
        client.character.state.position[2],
      ],
      rotation: [
        client.character.state.rotation[0],
        client.character.state.rotation[1],
        client.character.state.rotation[2],
      ],
      color: {},
      unknownData1: { unknownData1: {} },
      extraModel: "SurvivorMale_Head_01.adr",
    };
    server.sendData(client, "AddLightweightNpc", npc);
    server._npcs[characterId] = npc; // save npc
  },
  spawnVehicle: function (server, client, args) {
    const guid = server.generateGuid();
    const transientId = server.getTransientId(client, guid);
    if (!args[1]) {
      server.sendChatText(client, "[ERROR] You need to specify a model id !");
      return;
    }
    const choosenModelId = Number(args[1]);
    const characterId = generateCharacterId();
    const npc = {
      npcData: {
        characterId: characterId,
        guid: guid,
        transientId: transientId,
        modelId: choosenModelId,
        position: [
          client.character.state.position[0],
          client.character.state.position[1],
          client.character.state.position[2],
        ],
        rotation: [
          client.character.state.rotation[0],
          client.character.state.rotation[1],
          client.character.state.rotation[2],
        ],
        color: {},
        unknownData1: { unknownData1: {} },
      },
      positionUpdate: server.createPositionUpdate(
        client.character.state.position,
        [0, 0, 0, 0]
      ),
    };
    server.sendData(client, "AddLightweightVehicle", npc);
    server._npcs[characterId] = npc; // save npc
  },
  spawnPcModel: function (server, client, args) {
    const guid = server.generateGuid();
    //const characterId = generateCharacterId();
    const transientId = server.getTransientId(client, guid);
    debug("spawnPcModel called");
    /*
    if (!args[1]) {
      server.sendChatText(client, "[ERROR] You need to specify a model id !");
      return;
    }
    */
    //const choosenModelId = Number(args[1]);

    debug(`\n\n\n\nguid: ${guid}\n\n\n\n`);
    const lightweight = {
      guid: guid,
      transientId: transientId,
      //modelId: choosenModelId,
      position: [
        client.character.state.position[0],
        client.character.state.position[1],
        client.character.state.position[2],
      ],
      roation: client.character.state.rotation,
      identity: {},
    };
    const full = {
      fullPcSubDataSchema1: { transientIdMaybe: transientId },
      array1: [],
      unknownData1: {
        transientId: transientId,
        unknownData1: {},
        array1: [],
        array2: [],
      },
    };
    server.sendData(client, "AddLightweightPc", lightweight);
    //server.sendData(client, "LightweightToFullPc", full);
    // server._npcs[characterId] = lightweight; // save npc
  },
  sonic: function (server, client, args) {
    server.sendData(client, "ClientGameSettings", {
      unknownQword1: "0x0000000000000000",
      unknownBoolean1: true,
      timescale: 3.0,
      unknownQword2: "0x0000000000000000",
      unknownFloat1: 0.0,
      unknownFloat2: 12.0,
      unknownFloat3: 110.0,
    });
    server.sendData(client, "Command.RunSpeed", {
      runSpeed: -100,
    });
    server.sendChatText(client, "Welcome MR.Hedgehog");
  },
  shutdown: function (server, client, args) {
    server.sendData(client, "WorldShutdownNotice", {
      timeLeft: 0,
      message: " ",
    });
  },
  weather: function (server, client, args) {
    const weatherTemplate = server._soloMode
      ? server._weatherTemplates[args[1]]
      : _.find(server._weatherTemplates, (template) => {
          return template.templateName === args[1];
        });
    if (!args[1]) {
      server.sendChatText(
        client,
        "Please define a weather template to use (data/weather.json)"
      );
    } else if (weatherTemplate) {
      server.changeWeather(client, weatherTemplate);
      server.sendChatText(client, `Use "${args[1]}" as a weather template`);
    } else {
      if (args[1] === "list") {
        server.sendChatText(client, `Weather templates :`);
        _.forEach(server._weatherTemplates, function (element, key) {
          console.log(element.templateName);
          server.sendChatText(client, `- ${element.templateName}`);
        });
      } else {
        server.sendChatText(client, `"${args[1]}" isn't a weather template`);
        server.sendChatText(
          client,
          `Use "/hax weather list" to know all available templates`
        );
      }
    }
  },
  saveCurrentWeather: async function (server, client, args) {
    if (!args[1]) {
      server.sendChatText(
        client,
        "Please define a name for your weather template '/hax saveCurrentWeather {name}'"
      );
    } else if (
      server._weatherTemplates[args[1]] ||
      _.find(server._weatherTemplates, (template) => {
        return template.templateName === args[1];
      })
    ) {
      server.sendChatText(client, `"${args[1]}" already exist !`);
    } else {
      const { _weather: currentWeather } = server;
      if (currentWeather) {
        currentWeather.templateName = args[1];
        if (server._soloMode) {
          server._weatherTemplates[currentWeather.templateName] =
            currentWeather;
          fs.writeFileSync(
            `${__dirname}/../../../../../data/2016/sampleData/weather.json`,
            JSON.stringify(server._weatherTemplates)
          );
          delete require.cache[
            require.resolve("../../../../data/2016/sampleData/weather.json")
          ];
          server._weatherTemplates = require("../../../../data/2016/sampleData/weather.json");
        } else {
          await server._db.collection("weathers").insertOne(currentWeather);
          server._weatherTemplates = await server._db
            .collection("weathers")
            .find()
            .toArray();
        }
        server.sendChatText(client, `template "${args[1]}" saved !`);
      } else {
        server.sendChatText(client, `Saving current weather failed...`);
        server.sendChatText(client, `plz report this`);
      }
    }
  },
  run: function (server, client, args) {
    const speedValue = args[1];
    let speed;
    if (speedValue > 10) {
      server.sendChatText(
        client,
        "To avoid security issue speed > 10 is set to 15",
        true
      );
      speed = 15;
    } else {
      speed = speedValue;
    }
    server.sendChatText(client, "Setting run speed: " + speed, true);
    server.sendData(client, "Command.RunSpeed", {
      runSpeed: speed,
    });
  },
  hell: function (server, client, args) {
    server.sendChatText(
      client,
      "[DEPRECATED] use '/hax randomWeather' instead",
      true
    );
  },
  randomWeather: function (server, client, args) {
    debug("Randomized weather");
    server.sendChatText(client, `Randomized weather`);
    function rnd_number() {
      return Number((Math.random() * 100).toFixed(0));
    }

    const rnd_weather = {
      name: "sky",
      unknownDword1: rnd_number(),
      unknownDword2: rnd_number(),
      unknownDword3: rnd_number(),
      unknownDword4: rnd_number(),
      fogDensity: rnd_number(), // fog intensity
      fogGradient: rnd_number(),
      fogFloor: rnd_number(),
      unknownDword7: rnd_number(),
      rain: rnd_number(),
      temp: rnd_number(), // 0 : snow map , 40+ : spring map
      skyColor: rnd_number(),
      cloudWeight0: rnd_number(),
      cloudWeight1: rnd_number(),
      cloudWeight2: rnd_number(),
      cloudWeight3: rnd_number(),
      sunAxisX: rnd_number(),
      sunAxisY: rnd_number(),
      sunAxisZ: rnd_number(), // night when 100
      unknownDword18: rnd_number(),
      unknownDword19: rnd_number(),
      unknownDword20: rnd_number(),
      wind: rnd_number(),
      unknownDword22: rnd_number(),
      unknownDword23: rnd_number(),
      unknownDword24: rnd_number(),
      unknownArray: _.fill(Array(50), {
        unknownDword1: 0,
        unknownDword2: 0,
        unknownDword3: 0,
        unknownDword4: 0,
        unknownDword5: 0,
        unknownDword6: 0,
        unknownDword7: 0,
      }),
    };
    debug(JSON.stringify(rnd_weather));
    server.changeWeather(client, rnd_weather);
  },
  setresource: function (server, client, args) {
    const resourceEvent = {
      type: 2,
      eventData: {
        unknownArray1: [],
        unknownArray2: [],
      },
    };
    server.sendChatText(client, "Setting character resource");
    server.sendData(client, "ResourceEvent", resourceEvent);
  },
  systemmessage: function (server, client, args) {
    if (!args[1]) {
      server.sendChatText(client, "Missing 'message' parameter");
      return;
    }
    const msg = {
      unknownDword1: 0,
      message: args[1],
      unknownDword2: 0,
      color: 2,
    };
    server.sendChatText(client, "Sending system message");
    server.sendData(client, "ShowSystemMessage", msg);
  },
};

export default hax;