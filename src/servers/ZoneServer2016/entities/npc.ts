// ======================================================================
//
//   GNU GENERAL PUBLIC LICENSE
//   Version 3, 29 June 2007
//   copyright (C) 2020 - 2021 Quentin Gruber
//   copyright (C) 2021 - 2025 H1emu community
//
//   https://github.com/QuentinGruber/h1z1-server
//   https://www.npmjs.com/package/h1z1-server
//
//   Based on https://github.com/psemu/soe-network
// ======================================================================

import { DamageInfo } from "types/zoneserver";
import { ZoneServer2016 } from "../zoneserver";
import { BaseFullCharacter } from "./basefullcharacter";
import { ZoneClient2016 } from "../classes/zoneclient";
import {
  chance,
  generateRandomGuid,
  getCurrentServerTimeWrapper,
  getDistance,
  logClientActionToMongo,
  randomIntFromInterval
} from "../../../utils/utils";
import { DB_COLLECTIONS, KILL_TYPE } from "../../../utils/enums";
import {
  Items,
  MaterialTypes,
  MeleeTypes,
  ModelIds,
  NpcIds,
  PositionUpdateType,
  StringIds
} from "../models/enums";
import { CommandInteractionString } from "types/zone2016packets";
import { BaseEntity } from "./baseentity";
import { ChallengeType } from "../managers/challengemanager";
import { ProjectileEntity } from "./projectileentity";
import { Lootbag } from "../entities/lootbag";
import { LoadoutContainer } from "../classes/loadoutcontainer";

export class Npc extends BaseFullCharacter {
  health: number;
  npcRenderDistance = 80;
  spawnerId: number;
  deathTime: number = 0;
  npcId: number = 0;
  rewardItems: { itemDefId: number; weight: number }[] = [];
  flags = {
    bit0: 0,
    bit1: 0,
    bit2: 0,
    bit3: 0,
    bit4: 0,
    bit5: 0,
    bit6: 0,
    bit7: 0,
    nonAttackable: 0, // disables melee flinch
    bit9: 0,
    bit10: 0,
    bit11: 0,
    projectileCollision: 1,
    bit13: 0, // causes a crash if 1 with noCollide 1
    bit14: 0,
    bit15: 0,
    bit16: 0,
    bit17: 0,
    bit18: 0,
    bit19: 0,
    noCollide: 0, // determines if NpcCollision packet gets sent on player collide
    knockedOut: 0, // knockedOut = 1 will not show the entity if the value is sent immediatly at 1
    bit22: 0,
    bit23: 0
  };
  public get isAlive(): boolean {
    return this.deathTime == 0;
  }
  server: ZoneServer2016;
  npcMeleeDamage: number;
  isSelected: boolean = false;
  constructor(
    characterId: string,
    transientId: number,
    actorModelId: number,
    position: Float32Array,
    rotation: Float32Array,
    server: ZoneServer2016,
    spawnerId: number = 0
  ) {
    super(characterId, transientId, actorModelId, position, rotation, server);
    this.positionUpdateType = PositionUpdateType.MOVABLE;
    this.spawnerId = spawnerId;
    this.health = 10000;
    this.initNpcData();
    this.server = server;
    switch (actorModelId) {
      case ModelIds.ZOMBIE_FEMALE_WALKER:
      case ModelIds.ZOMBIE_MALE_WALKER:
        this.materialType = MaterialTypes.ZOMBIE;
        this.npcMeleeDamage = 2000;
        break;
      case ModelIds.ZOMBIE_SCREAMER:
        this.materialType = MaterialTypes.ZOMBIE;
        this.npcMeleeDamage = 3000;
        break;
      case ModelIds.DEER:
      case ModelIds.DEER_BUCK:
        this.materialType = MaterialTypes.FLESH;
        this.npcMeleeDamage = 0;
        break;
      case ModelIds.WOLF:
        this.materialType = MaterialTypes.FLESH;
        this.npcMeleeDamage = 2000;
        break;
      case ModelIds.BEAR:
        this.materialType = MaterialTypes.FLESH;
        this.npcMeleeDamage = 4000;
        break;
      default:
        this.materialType = MaterialTypes.FLESH;
        this.npcMeleeDamage = 0;
        break;
    }
    server.aiManager.addEntity(this);
  }

  playAnimation(animationName: string) {
    this.server.sendDataToAllWithSpawnedEntity(
      this.server._npcs,
      this.characterId,
      "Character.PlayAnimation",
      {
        characterId: this.characterId,
        animationName: animationName
      }
    );
  }

  applyDamage(characterId: string) {
    const client = this.server.getClientByCharId(characterId);
    if (client) {
      const damageInfo: DamageInfo = {
        entity: this.characterId,
        weapon: Items.WEAPON_MACHETE01,
        damage: this.npcMeleeDamage,
        causeBleed: false, // another method for melees to apply bleeding
        meleeType: MeleeTypes.BLADE,
        hitReport: {
          sessionProjectileCount: 0,
          characterId: client.character.characterId,
          position: client.character.state.position,
          unknownFlag1: 0,
          unknownByte2: 0,
          totalShotCount: 0,
          hitLocation: client.character.meleeHit.abilityHitLocation
        }
      };
      client.character.OnMeleeHit(this.server, damageInfo);
    } else {
      console.log(
        `CharacterId ${characterId} not found when applying damage from npc`
      );
    }
  }

  async damage(server: ZoneServer2016, damageInfo: DamageInfo) {
    let client = server.getClientByCharId(damageInfo.entity);
    if (!client) {
      const sourceEntity = server.getEntity(damageInfo.entity);
      if (sourceEntity instanceof ProjectileEntity) {
        client = server.getClientByCharId(sourceEntity.managerCharacterId);
      } else {
        return;
      }
    }
    const oldHealth = this.health;

    if ((this.health -= damageInfo.damage) <= 0 && this.isAlive) {
      this.deathTime = Date.now();
      this.flags.knockedOut = 1;

      // Custom lootbag for zombies
      switch (this.actorModelId) {
        case ModelIds.ZOMBIE_FEMALE_WALKER:
        case ModelIds.ZOMBIE_MALE_WALKER:
        case ModelIds.ZOMBIE_SCREAMER: {
          this.addZombieLoot(server);
          break;
        }
        default:
          server.worldObjectManager.createLootbag(server, this);
          break;
      }

      if (client) {
        if (this.npcId === NpcIds.ZOMBIE) {
          server.challengeManager.registerChallengeProgression(
            client,
            ChallengeType.BRAIN_DEAD,
            1
          );
        }
        if (!server._soloMode) {
          logClientActionToMongo(
            server._db.collection(DB_COLLECTIONS.KILLS),
            client,
            server._worldId,
            {
              type:
                this.npcId == NpcIds.ZOMBIE
                  ? KILL_TYPE.ZOMBIE
                  : KILL_TYPE.WILDLIFE
            }
          );
        }

        if (this.npcId == NpcIds.ZOMBIE)
          client.character.metrics.zombiesKilled++;
        else client.character.metrics.wildlifeKilled++;
      }
      for (const a in server._clients) {
        const c = server._clients[a];
        if (c.spawnedEntities.has(this)) {
          if (!c.isLoading) {
            server.sendData(c, "Character.StartMultiStateDeath", {
              data: {
                characterId: this.characterId,
                flag: 128,
                managerCharacterId: c.character.characterId
              }
            });
            server.sendData(c, "Character.ManagedObject", {
              objectCharacterId: this.characterId,
              characterId: c.character.characterId
            });
          } else {
            server.sendData(c, "Character.StartMultiStateDeath", {
              data: {
                characterId: this.characterId,
                flag: 0
              }
            });
          }
        }
      }
    }

    if (client) {
      const damageRecord = await server.generateDamageRecord(
        this.characterId,
        damageInfo,
        oldHealth
      );
      client.character.addCombatlogEntry(damageRecord);
    }
  }

  addZombieLoot(server: ZoneServer2016) {
    const lootItems: any[] = [];

    const wornLetters = [
      Items.WORN_LETTER_CHURCH_PV,
      Items.WORN_LETTER_LJ_PV,
      Items.WORN_LETTER_MISTY_DAM,
      Items.WORN_LETTER_RADIO,
      Items.WORN_LETTER_RUBY_LAKE,
      Items.WORN_LETTER_TOXIC_LAKE,
      Items.WORN_LETTER_VILLAS,
      Items.WORN_LETTER_WATER_TOWER
    ];
    // Worn letter (4% chance, up to 2)
    if (chance(50)) {
      const randomWornLetter =
        wornLetters[randomIntFromInterval(0, wornLetters.length - 1)];
      const wornLetterItem = server.generateItem(randomWornLetter, 1);
      if (wornLetterItem) {
        lootItems.push(wornLetterItem);
      }
    }

    const GoodammoTypes = [
      Items.AMMO_12GA,
      Items.AMMO_223,
      Items.AMMO_308,
      Items.AMMO_762
    ];
    // Ammo (5% chance)
    if (chance(50)) {
      for (let i = 0; i < 2; i++) {
        const randomAmmo =
          GoodammoTypes[randomIntFromInterval(0, GoodammoTypes.length - 1)];
        const ammoCount = randomIntFromInterval(1, 3);
        const ammoItem = server.generateItem(randomAmmo, ammoCount);
        if (ammoItem) {
          lootItems.push(ammoItem);
        }
      }
    }

    const ammoTypes = [Items.AMMO_380, Items.AMMO_9MM, Items.AMMO_45];
    // Ammo (10% chance)
    if (chance(100)) {
      for (let i = 0; i < ammoTypes.length - 1; i++) {
        const randomAmmo =
          ammoTypes[randomIntFromInterval(0, ammoTypes.length - 1)];
        const ammoCount = randomIntFromInterval(1, 5);
        const ammoItem = server.generateItem(randomAmmo, ammoCount);
        if (ammoItem) {
          lootItems.push(ammoItem);
        }
      }
    }

    const specialItems = [
      Items.WEAPON_BOW_MAKESHIFT,
      Items.BACKPACK_BLUE_ORANGE,
      Items.CRUMPLED_NOTE,
      Items.REFRIGERATOR_NOTE
    ];
    // Special item (15% chance)
    if (chance(150)) {
      for (let i = 0; i < specialItems.length - 1; i++) {
        const randomSpecial =
          specialItems[randomIntFromInterval(0, specialItems.length - 1)];
        const specialItem = server.generateItem(randomSpecial, 1);
        if (specialItem) {
          lootItems.push(specialItem);
        }
      }
    }

    // Prototype item (1% chance)
    const PrototypeItems = [
      Items.PROTOTYPE_MECHANISM,
      Items.PROTOTYPE_RECEIVER,
      Items.PROTOTYPE_TRIGGER_ASSEMBLY
    ];
    if (chance(10)) {
      const randomSpecial =
        PrototypeItems[randomIntFromInterval(0, PrototypeItems.length - 1)];
      const specialItem = server.generateItem(randomSpecial, 1);
      if (specialItem) {
        lootItems.push(specialItem);
      }
    }

    // Cloth (80% chance)
    if (chance(800)) {
      const clothCount = randomIntFromInterval(1, 3);
      const clothItem = server.generateItem(Items.CLOTH, clothCount);
      if (clothItem) {
        lootItems.push(clothItem);
      }
    }

    // Only spawn lootbag if there is loot
    if (lootItems.length === 0) return;

    const characterId = generateRandomGuid();
    const lootbag = new Lootbag(
      characterId,
      server.getTransientId(characterId),
      ModelIds.LOOT_BAG_CLEAN,
      new Float32Array([
        this.state.position[0] + 0.7,
        this.state.position[1],
        this.state.position[2] + 0.7
      ]),
      new Float32Array([0, 0, 0, 0]),
      server
    );
    const container = lootbag.getContainer();

    for (const item of lootItems) {
      server.addContainerItem(lootbag, item, container as LoadoutContainer);
    }

    server._lootbags[characterId] = lootbag;
  }

  OnFullCharacterDataRequest(server: ZoneServer2016, client: ZoneClient2016) {
    server.sendData(client, "LightweightToFullNpc", this.pGetFull(server));

    if (this.onReadyCallback) {
      this.onReadyCallback(client);
      delete this.onReadyCallback;
    }
  }

  OnExplosiveHit(server: ZoneServer2016, sourceEntity: BaseEntity): void {
    let damage = this.health + this.health / 2;

    const distance = getDistance(
      sourceEntity.state.position,
      this.state.position
    );
    if (distance > 5) return;
    if (distance > 1) damage /= distance;
    this.damage(server, {
      entity: sourceEntity.characterId,
      damage: damage
    });
  }

  OnProjectileHit(server: ZoneServer2016, damageInfo: DamageInfo) {
    if (
      server.isHeadshotOnly &&
      damageInfo.hitReport?.hitLocation != "HEAD" &&
      this.isAlive
    )
      return;
    const client = server.getClientByCharId(damageInfo.entity);
    if (client && this.isAlive) {
      const hasHelmetBefore = this.hasHelmet(server);
      const hasArmorBefore = this.hasArmor(server);
      server.sendHitmarker(
        client,
        damageInfo.hitReport?.hitLocation,
        this.hasHelmet(server),
        this.hasArmor(server),
        hasHelmetBefore,
        hasArmorBefore
      );
    }
    switch (damageInfo.hitReport?.hitLocation) {
      case "HEAD":
      case "GLASSES":
      case "NECK":
        damageInfo.damage *= 4;
        break;
      default:
        break;
    }
    this.damage(server, damageInfo);
  }

  OnMeleeHit(server: ZoneServer2016, damageInfo: DamageInfo) {
    if (!this.isAlive) return; // prevent dead npc despawning from melee dmg
    damageInfo.damage = damageInfo.damage / 1.5;
    this.damage(server, damageInfo);
  }

  destroy(server: ZoneServer2016): boolean {
    return server.deleteEntity(this.characterId, server._npcs);
  }

  initNpcData() {
    switch (this.actorModelId) {
      case ModelIds.ZOMBIE_SCREAMER:
        this.nameId = StringIds.BANSHEE;
        this.npcId = NpcIds.ZOMBIE;
        break;
      case ModelIds.ZOMBIE_FEMALE_WALKER:
      case ModelIds.ZOMBIE_MALE_WALKER:
        this.nameId = StringIds.ZOMBIE_WALKER;
        this.rewardItems = [
          {
            itemDefId: Items.BRAIN_INFECTED,
            weight: 10
          }
        ];
        this.npcId = NpcIds.ZOMBIE;
        break;
      case ModelIds.DEER_BUCK:
      case ModelIds.DEER:
        this.nameId = StringIds.DEER;
        this.rewardItems = [
          {
            itemDefId: Items.MEAT_VENISON,
            weight: 30
          },
          {
            itemDefId: Items.ANIMAL_FAT,
            weight: 20
          },
          {
            itemDefId: Items.DEER_BLADDER,
            weight: 10
          }
        ];
        this.npcId = NpcIds.DEER;
        break;
      case ModelIds.WOLF:
        this.nameId = StringIds.WOLF;
        this.rewardItems = [
          {
            itemDefId: Items.MEAT_WOLF,
            weight: 30
          },
          {
            itemDefId: Items.ANIMAL_FAT,
            weight: 20
          }
        ];
        this.npcId = NpcIds.WOLF;
        break;
      case ModelIds.BEAR:
        this.nameId = StringIds.BEAR;
        this.rewardItems = [
          {
            itemDefId: Items.MEAT_BEAR,
            weight: 40
          },
          {
            itemDefId: Items.ANIMAL_FAT,
            weight: 20
          }
        ];
        this.npcId = NpcIds.BEAR;
        break;
    }
  }

  OnPlayerSelect(server: ZoneServer2016, client: ZoneClient2016) {
    // Only one at a time
    if (this.isSelected) {
      return;
    }
    this.isSelected = true;
    // Unlock selection after 5sec
    // It's easier to do it that way that to make a whole sys with the utilizeHudTimer
    setTimeout(() => {
      this.isSelected = false;
    }, 5_100);
    const skinningKnife = client.character.getItemById(Items.SKINNING_KNIFE);
    if (!this.isAlive && skinningKnife) {
      server.utilizeHudTimer(client, this.nameId, 5000, 0, () => {
        switch (this.actorModelId) {
          case ModelIds.ZOMBIE_FEMALE_WALKER:
          case ModelIds.ZOMBIE_MALE_WALKER:
          case ModelIds.ZOMBIE_SCREAMER:
            const emptySyringe = client.character.getItemById(
              Items.SYRINGE_EMPTY
            );
            if (emptySyringe) {
              client.character.lootContainerItem(
                server,
                server.generateItem(Items.SYRINGE_INFECTED_BLOOD)
              );
              server.removeInventoryItem(client.character, emptySyringe);
              return;
            }
            this.triggerAwards(server, client, this.rewardItems);
            break;
          case ModelIds.DEER_BUCK:
          case ModelIds.DEER:
            this.triggerAwards(server, client, this.rewardItems);
            break;
          case ModelIds.BEAR:
            this.triggerAwards(server, client, this.rewardItems);
            break;
          case ModelIds.WOLF:
            this.triggerAwards(server, client, this.rewardItems);
            break;
        }
        server.damageItem(client.character, skinningKnife, 200);
        server.deleteEntity(this.characterId, server._npcs);
      });
    }
  }

  triggerAwards(
    server: ZoneServer2016,
    client: ZoneClient2016,
    rewardItems: { itemDefId: number; weight: number }[]
  ) {
    const ranges = [];
    const preRewardedItems: number[] = [];
    let cumulativeWeight = 0;
    for (const reward of rewardItems) {
      const range = {
        start: cumulativeWeight,
        end: cumulativeWeight + reward.weight,
        item: reward
      };
      ranges.push(range);
      cumulativeWeight = range.end;
    }

    const totalWeight = rewardItems.reduce((sum, item) => sum + item.weight, 0);
    let count = 1;

    let selectedRange = ranges[0];
    for (let i = 0; i < rewardItems.length; i++) {
      const randomValue = Math.random() * totalWeight;
      for (const range of ranges) {
        if (randomValue >= range.start && randomValue < range.end) {
          selectedRange = range;
          break; // Break out of the loop once a range is chosen
        }
      }

      if (!preRewardedItems.includes(selectedRange.item.itemDefId)) {
        preRewardedItems.push(selectedRange.item.itemDefId);

        if (
          Math.random() <= 0.4 &&
          selectedRange.item.itemDefId != Items.BRAIN_INFECTED
        ) {
          // 40% chance to spawn double rewards
          count = 2;
        }

        const rewardItem = server.generateItem(
          selectedRange.item.itemDefId,
          count
        );
        if (rewardItem) client.character.lootContainerItem(server, rewardItem);
      }
    }
  }

  OnInteractionString(server: ZoneServer2016, client: ZoneClient2016) {
    if (!this.isAlive && client.character.hasItem(Items.SKINNING_KNIFE)) {
      switch (this.actorModelId) {
        case ModelIds.ZOMBIE_FEMALE_WALKER:
        case ModelIds.ZOMBIE_MALE_WALKER:
        case ModelIds.ZOMBIE_SCREAMER:
          if (client.character.hasItem(Items.SYRINGE_EMPTY)) {
            this.sendInteractionString(server, client, StringIds.EXTRACT_BLOOD);
            return;
          }
          this.sendInteractionString(server, client, StringIds.HARVEST);
          break;
        case ModelIds.DEER_BUCK:
        case ModelIds.DEER:
        case ModelIds.WOLF:
        case ModelIds.BEAR:
          this.sendInteractionString(server, client, StringIds.HARVEST);
          break;
      }
    }
  }

  sendInteractionString(
    server: ZoneServer2016,
    client: ZoneClient2016,
    stringId: number
  ) {
    server.sendData<CommandInteractionString>(
      client,
      "Command.InteractionString",
      {
        guid: this.characterId,
        stringId: stringId
      }
    );
  }
  goTo(position: Float32Array) {
    const angleInRadians2 = Math.random() * (2 * Math.PI) - Math.PI;
    const angleInRadians = Math.atan2(
      position[1] - this.state.position[1],
      getDistance(this.state.position, position)
    );
    this.state.position = position;
    this.server.sendDataToAll("PlayerUpdatePosition", {
      transientId: this.transientId,
      positionUpdate: {
        sequenceTime: getCurrentServerTimeWrapper().getTruncatedU32(),
        position: this.state.position,
        unknown3_int8: 0,
        stance: 66565,
        engineRPM: 0,
        orientation: angleInRadians2,
        frontTilt: 0,
        sideTilt: 0,
        angleChange: 0,
        verticalSpeed: angleInRadians,
        horizontalSpeed: 0.5
      }
    });
  }
}
