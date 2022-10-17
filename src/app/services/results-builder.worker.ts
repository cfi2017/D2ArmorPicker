import { BuildConfiguration } from "../data/buildConfiguration";
import { IInventoryArmor } from "../data/types/IInventoryArmor";
import { buildDb } from "../data/database";
import { ArmorSlot } from "../data/enum/armor-slot";
import { FORCE_USE_NO_EXOTIC } from "../data/constants";
import { ModInformation } from "../data/ModInformation";
import { ArmorPerkOrSlot, ArmorStat, SpecialArmorStat, STAT_MOD_VALUES, StatModifier } from "../data/enum/armor-stat";
import { IManifestArmor } from "../data/types/IManifestArmor";
import { DestinyEnergyType, TierType } from "bungie-api-ts/destiny2";

const db = buildDb(async () => {
})
const inventoryArmor = db.table("inventoryArmor");
const manifestArmor = db.table("manifestArmor");

function checkElements(config: BuildConfiguration, constantElementRequirements: number[], availableClassElements: Set<DestinyEnergyType>,
                       helmet: IInventoryArmor, gauntlet: IInventoryArmor, chest: IInventoryArmor, leg: IInventoryArmor) {
  let requirements = constantElementRequirements.slice()
  let wildcard = requirements[0]

  if ((helmet.masterworked && config.ignoreArmorAffinitiesOnMasterworkedItems)
    || (!helmet.masterworked && config.ignoreArmorAffinitiesOnNonMasterworkedItems)) wildcard++;
  else requirements[helmet.energyAffinity]--;

  if ((gauntlet.masterworked && config.ignoreArmorAffinitiesOnMasterworkedItems)
    || (!gauntlet.masterworked && config.ignoreArmorAffinitiesOnNonMasterworkedItems)) wildcard++;
  else requirements[gauntlet.energyAffinity]--;

  if ((chest.masterworked && config.ignoreArmorAffinitiesOnMasterworkedItems)
    || (!chest.masterworked && config.ignoreArmorAffinitiesOnNonMasterworkedItems)) wildcard++;
  else requirements[chest.energyAffinity]--;

  if ((leg.masterworked && config.ignoreArmorAffinitiesOnMasterworkedItems)
    || (!leg.masterworked && config.ignoreArmorAffinitiesOnNonMasterworkedItems)) wildcard++;
  else requirements[leg.energyAffinity]--;

//  if (config.armorAffinities[ArmorSlot.ArmorSlotClass].value == DestinyEnergyType.Any)
//    wildcard++;

  let bad = (
    Math.max(0, requirements[DestinyEnergyType.Arc])
    + Math.max(0, requirements[DestinyEnergyType.Thermal])
    + Math.max(0, requirements[DestinyEnergyType.Void])
    + Math.max(0, requirements[DestinyEnergyType.Stasis])
  ) - wildcard

  var requiredClassItemElement = DestinyEnergyType.Any;

  if (config.armorAffinities[ArmorSlot.ArmorSlotClass].fixed)
    requiredClassItemElement = config.armorAffinities[ArmorSlot.ArmorSlotClass].value;

  if (bad == 1
    &&
    !(config.armorAffinities[ArmorSlot.ArmorSlotClass].fixed && config.armorAffinities[ArmorSlot.ArmorSlotClass].value != DestinyEnergyType.Any)) {
    var fixed = false;
    for (let k of [DestinyEnergyType.Void, DestinyEnergyType.Stasis, DestinyEnergyType.Thermal, DestinyEnergyType.Arc]) {
      if (requirements[k] <= 0) continue;
      if (availableClassElements.has(k)) {
        fixed = true;
        requiredClassItemElement = k;
      }
    }
    if (fixed) bad--;
  }

  return {valid: bad <= 0, requiredClassItemElement};
}

function checkSlots(config: BuildConfiguration, constantModslotRequirement: number[], availableClassItemTypes: Set<ArmorPerkOrSlot>,
                    helmet: IInventoryArmor, gauntlet: IInventoryArmor, chest: IInventoryArmor, leg: IInventoryArmor) {

  var exoticId = config.selectedExotics[0] || 0
  let requirements = constantModslotRequirement.slice()
  if ((exoticId <= 0 || (helmet.hash != exoticId))
    && config.armorPerks[ArmorSlot.ArmorSlotHelmet].fixed && config.armorPerks[ArmorSlot.ArmorSlotHelmet].value != ArmorPerkOrSlot.None
    && config.armorPerks[ArmorSlot.ArmorSlotHelmet].value != helmet.perk)
    return {valid: false};
  if ((exoticId <= 0 || (gauntlet.hash != exoticId))
    && config.armorPerks[ArmorSlot.ArmorSlotGauntlet].fixed && config.armorPerks[ArmorSlot.ArmorSlotGauntlet].value != ArmorPerkOrSlot.None
    && config.armorPerks[ArmorSlot.ArmorSlotGauntlet].value != gauntlet.perk)
    return {valid: false};
  if ((exoticId <= 0 || (chest.hash != exoticId))
    && config.armorPerks[ArmorSlot.ArmorSlotChest].fixed && config.armorPerks[ArmorSlot.ArmorSlotChest].value != ArmorPerkOrSlot.None
    && config.armorPerks[ArmorSlot.ArmorSlotChest].value != chest.perk)
    return {valid: false};
  if ((exoticId <= 0 || (leg.hash != exoticId))
    && config.armorPerks[ArmorSlot.ArmorSlotLegs].fixed && config.armorPerks[ArmorSlot.ArmorSlotLegs].value != ArmorPerkOrSlot.None
    && config.armorPerks[ArmorSlot.ArmorSlotLegs].value != leg.perk)
    return {valid: false};
  // also return if we can not find the correct class item. pepepoint.
  if (config.armorPerks[ArmorSlot.ArmorSlotClass].fixed && config.armorPerks[ArmorSlot.ArmorSlotClass].value != ArmorPerkOrSlot.None
    && !availableClassItemTypes.has(config.armorPerks[ArmorSlot.ArmorSlotClass].value))
    return {valid: false};

  requirements[helmet.perk]--;
  requirements[gauntlet.perk]--;
  requirements[chest.perk]--;
  requirements[leg.perk]--;

  // ignore exotic selection
  if (exoticId > 0) {
    if (helmet.hash == exoticId) requirements[config.armorPerks[helmet.slot].value]--;
    else if (gauntlet.hash == exoticId) requirements[config.armorPerks[gauntlet.slot].value]--;
    else if (chest.hash == exoticId) requirements[config.armorPerks[chest.slot].value]--;
    else if (leg.hash == exoticId) requirements[config.armorPerks[leg.slot].value]--;
  }

  let bad = 0;
  for (let n = 1; n < ArmorPerkOrSlot.COUNT; n++)
    bad += Math.max(0, requirements[n])

  var requiredClassItemType = ArmorPerkOrSlot.None
  if (bad == 1) {
    // search if we have a class item to fulfill the stats
    var fixed = false;
    for (let k = 1; k < ArmorPerkOrSlot.COUNT && !fixed; k++) {
      if (requirements[k] <= 0) continue;
      if (availableClassItemTypes.has(k)) {
        fixed = true;
        requiredClassItemType = k;
      }
    }
    if (fixed) bad--;
  } else if (requiredClassItemType == ArmorPerkOrSlot.None && config.armorPerks[ArmorSlot.ArmorSlotClass].fixed) {
    requiredClassItemType = config.armorPerks[ArmorSlot.ArmorSlotClass].value
  }

  // if (config.armorPerks[ArmorSlot.ArmorSlotClass].value != ArmorPerkOrSlot.None && !config.armorPerks[ArmorSlot.ArmorSlotClass].fixed) bad--;

  return {valid: bad <= 0, requiredClassItemType};
}

function prepareConstantStatBonus(config: BuildConfiguration) {
  const constantBonus = [0, 0, 0, 0, 0, 0]
  // Apply configurated mods to the stat value
  // Apply mods
  for (const mod of config.enabledMods) {
    for (const bonus of ModInformation[mod].bonus) {
      var statId = bonus.stat == SpecialArmorStat.ClassAbilityRegenerationStat
        ? [1, 0, 2][config.characterClass]
        : bonus.stat
      constantBonus[statId] += bonus.value;
    }
  }
  return constantBonus;
}

function prepareConstantElementRequirement(config: BuildConfiguration) {
  let constantElementRequirement = [0, 0, 0, 0, 0, 0, 0]
  //             [0, 2, 1, 1, 0, 0, 1] // 2 arc,  1 solar, 1 void; class item not fixed and stasis

  constantElementRequirement[config.armorAffinities[ArmorSlot.ArmorSlotHelmet].value]++;
  constantElementRequirement[config.armorAffinities[ArmorSlot.ArmorSlotChest].value]++;
  constantElementRequirement[config.armorAffinities[ArmorSlot.ArmorSlotGauntlet].value]++;
  constantElementRequirement[config.armorAffinities[ArmorSlot.ArmorSlotLegs].value]++;

  if (!config.armorAffinities[ArmorSlot.ArmorSlotClass].fixed)
    constantElementRequirement[config.armorAffinities[ArmorSlot.ArmorSlotClass].value]++;

  constantElementRequirement[0] = 0
  return constantElementRequirement;
}

function prepareConstantModslotRequirement(config: BuildConfiguration) {
  let constantElementRequirement = []
  for (let n = 0; n < ArmorPerkOrSlot.COUNT; n++) constantElementRequirement.push(0)

  constantElementRequirement[config.armorPerks[ArmorSlot.ArmorSlotHelmet].value]++;
  constantElementRequirement[config.armorPerks[ArmorSlot.ArmorSlotChest].value]++;
  constantElementRequirement[config.armorPerks[ArmorSlot.ArmorSlotGauntlet].value]++;
  constantElementRequirement[config.armorPerks[ArmorSlot.ArmorSlotLegs].value]++;
  constantElementRequirement[config.armorPerks[ArmorSlot.ArmorSlotClass].value]++;
  return constantElementRequirement;
}

function prepareConstantAvailableModslots(config: BuildConfiguration) {
  var availableModCost: number[] = [];
  availableModCost.push(config.maximumModSlots[ArmorSlot.ArmorSlotHelmet].value)
  availableModCost.push(config.maximumModSlots[ArmorSlot.ArmorSlotGauntlet].value)
  availableModCost.push(config.maximumModSlots[ArmorSlot.ArmorSlotChest].value)
  availableModCost.push(config.maximumModSlots[ArmorSlot.ArmorSlotLegs].value)
  availableModCost.push(config.maximumModSlots[ArmorSlot.ArmorSlotClass].value)
  return availableModCost.filter(d => d > 0).sort()
}

addEventListener('message', async ({data}) => {
  const startTime = Date.now();
  console.debug("START RESULTS BUILDER 2")
  console.time("total")
  const config = data.config as BuildConfiguration;
  console.log("Using config", data.config)

  // this gets the selected exotic hash or none (Option<Hash>?)
  let selectedExotics2: IManifestArmor[] = await Promise.all(config.selectedExotics
    .filter(hash => hash != FORCE_USE_NO_EXOTIC)
    .map(async hash => await manifestArmor.where("hash").equals(hash).first()))
  selectedExotics2 = selectedExotics2.filter(i => !!i)
  let selectedExotic: IManifestArmor | null = null;
  if (selectedExotics2.length > 0) selectedExotic = selectedExotics2[0];

  // use items for the correct class only
  // let exoticItemInfo = config.selectedExotics.length == 0    ? null    : await inventoryArmor.where("hash").equals(config.selectedExotics[0]).first() as IInventoryArmor
  let items = (await inventoryArmor.where("clazz").equals(config.characterClass)
    .distinct()
    .toArray() as IInventoryArmor[])

  // filter all player items
  items = items
    // only armor :)
    .filter(item => item.slot != ArmorSlot.ArmorSlotNone)
    // filter disabled items
    .filter(item => config.disabledItems.indexOf(item.itemInstanceId) == -1)
    // filter the selected exotic right here
    .filter(item => config.selectedExotics.indexOf(FORCE_USE_NO_EXOTIC) == -1 || !item.isExotic)
    .filter(item => !selectedExotic || selectedExotic.slot != item.slot || selectedExotic.hash == item.hash)
    // config.onlyUseMasterworkedItems - only keep masterworked items
    .filter(item => !config.onlyUseMasterworkedItems || item.masterworked)
    // non-legendaries and non-exotics
    .filter(item => config.allowBlueArmorPieces || item.rarity == TierType.Exotic || item.rarity == TierType.Superior)
    // sunset armor
    .filter(item => !config.ignoreSunsetArmor || !item.isSunset)
    // filter fixed elements
    .filter(item => {
      return !config.armorAffinities[item.slot].fixed
        || config.armorAffinities[item.slot].value == DestinyEnergyType.Any
        || (item.masterworked && config.ignoreArmorAffinitiesOnMasterworkedItems)
        || (!item.masterworked && config.ignoreArmorAffinitiesOnNonMasterworkedItems)
        || config.armorAffinities[item.slot].value == item.energyAffinity
    })
    // armor perks
    .filter(item => {
      return item.isExotic
        || !config.armorPerks[item.slot].fixed
        || config.armorPerks[item.slot].value == ArmorPerkOrSlot.None
        || config.armorPerks[item.slot].value == item.perk
    });
  // console.log(items.map(d => "id:'"+d.itemInstanceId+"'").join(" or "))


  // split items into slots
  let helmets = items.filter(i => i.slot == ArmorSlot.ArmorSlotHelmet)
  let gauntlets = items.filter(i => i.slot == ArmorSlot.ArmorSlotGauntlet)
  let chests = items.filter(i => i.slot == ArmorSlot.ArmorSlotChest)
  let legs = items.filter(i => i.slot == ArmorSlot.ArmorSlotLegs)
  // new Set(items.filter(i => i.slot == ArmorSlot.ArmorSlotClass).map(i => [i.energyAffinity, i.perk]))


  // Support multithreading. find the largest set and split it by N.
  const threadSplit = data.threadSplit as { count: number, current: number };
  if (threadSplit.count > 1) {
    var splitEntry = ([
      [helmets, helmets.length],
      [gauntlets, gauntlets.length],
      [chests, chests.length],
      [legs, legs.length],
    ] as [IInventoryArmor[], number][])
      .sort((a, b) => a[1] - b[1])[0][0]
    var keepLength = Math.floor(splitEntry.length / threadSplit.count)
    var startIndex = keepLength * threadSplit.current // we can delete everything before this
    var endIndex = keepLength * (threadSplit.current + 1) // we can delete everything after this
    // if we have rounding issues, let the last thread do the rest
    if (keepLength * threadSplit.count != splitEntry.length && threadSplit.current == threadSplit.count - 1)
      endIndex += splitEntry.length - keepLength * threadSplit.count

    // remove data at the end
    splitEntry.splice(endIndex)
    splitEntry.splice(0, startIndex)
  }


  let classItems = items.filter(i => i.slot == ArmorSlot.ArmorSlotClass);
  let availableClassItemPerkTypes = new Set(classItems.map(d => d.perk));
  let availableClassItemEnergyPerkDict = Array.from(availableClassItemPerkTypes)
    .reduce((p, v) => {
      if (!p.has(v)) p.set(v, new Set<DestinyEnergyType>());
      if (!p.has(ArmorPerkOrSlot.None)) p.set(ArmorPerkOrSlot.None, new Set<DestinyEnergyType>());
      for (let cls of classItems.filter(i => i.perk == v)) {
        p.get(ArmorPerkOrSlot.None)?.add(cls.energyAffinity)
        p.get(v)?.add(cls.energyAffinity)
      }
      return p;
    }, new Map<ArmorPerkOrSlot, Set<DestinyEnergyType>>())

  // if more than one exotic is selected
  console.debug("items", {
    helmets,
    gauntlets,
    chests,
    legs,
    availableClassItemTypes: availableClassItemPerkTypes,
    availableClassItemEnergyPerkDict
  })


  // runtime variables
  const runtime = {
    maximumPossibleTiers: [0, 0, 0, 0, 0, 0],
    statCombo3x100: new Set(),
    statCombo4x100: new Set(),
  }
  const constantBonus = prepareConstantStatBonus(config);
  const constantElementRequirement = prepareConstantElementRequirement(config);
  const constantModslotRequirement = prepareConstantModslotRequirement(config);
  const constantAvailableModslots = prepareConstantAvailableModslots(config);
  const constantMustCheckElementRequirement = constantElementRequirement[0] < 5


  let results: any[] = []
  let resultsLength = 0;

  let listedResults = 0;
  let totalResults = 0;
  let doNotOutput = false;

  console.time("tm")
  for (let helmet of helmets) {
    for (let gauntlet of gauntlets) {
      if (helmet.isExotic && gauntlet.isExotic) continue;
      for (let chest of chests) {
        if ((helmet.isExotic || gauntlet.isExotic) && chest.isExotic) continue;
        for (let leg of legs) {
          if ((helmet.isExotic || gauntlet.isExotic || chest.isExotic) && leg.isExotic) continue;
          /**
           *  At this point we already have:
           *  - Masterworked items, if they must be masterworked (config.onlyUseMasterworkedItems)
           *  - disabled items were already removed (config.disabledItems)
           */

          const slotCheckResult = checkSlots(config, constantModslotRequirement, availableClassItemPerkTypes, helmet, gauntlet, chest, leg);
          if (!slotCheckResult.valid) continue;

          var requiredClassElement = DestinyEnergyType.Any;
          if (constantMustCheckElementRequirement) {
            const energyCheckResult = checkElements(config, constantElementRequirement,
              availableClassItemEnergyPerkDict.get(slotCheckResult.requiredClassItemType ?? ArmorPerkOrSlot.None) ?? new Set(),
              helmet, gauntlet, chest, leg);
            if (!energyCheckResult.valid) continue;
            requiredClassElement = energyCheckResult.requiredClassItemElement;
          }


          const result = handlePermutation(runtime, config, helmet, gauntlet, chest, leg,
            constantBonus, constantAvailableModslots.slice(), doNotOutput);
          // Only add 50k to the list if the setting is activated.
          // We will still calculate the rest so that we get accurate results for the runtime values
          if (result != null) {
            totalResults++;
            if (result !== "DONOTSEND") {
              result["classItem"] = {
                perk: slotCheckResult.requiredClassItemType ?? ArmorPerkOrSlot.None,
                affinity: requiredClassElement,
              }

              results.push(result)
              resultsLength++;
              listedResults++;
              doNotOutput = doNotOutput || (config.limitParsedResults && listedResults >= 5e4 / threadSplit.count) || listedResults >= 1e6 / threadSplit.count
            }
          }
          //}
          if (resultsLength >= 5000) {
            // @ts-ignore
            postMessage({runtime, results, done: false, total: 0});
            results = []
            resultsLength = 0;
          }
        }
      }
    }
  }
  console.timeEnd("tm")
  console.timeEnd("total")

  //for (let n = 0; n < 6; n++)
  //  runtime.maximumPossibleTiers[n] = Math.floor(Math.min(100, runtime.maximumPossibleTiers[n]) / 10)

  // @ts-ignore
  postMessage({
    runtime,
    results,
    done: true,
    stats: {
      permutationCount: totalResults,
      itemCount: items.length - classItems.length,
      totalTime: Date.now() - startTime
    }
  });
})

function getStatSum(items: IInventoryArmor[]): [number, number, number, number, number, number] {
  return [
    items[0].mobility + items[1].mobility + items[2].mobility + items[3].mobility,
    items[0].resilience + items[1].resilience + items[2].resilience + items[3].resilience,
    items[0].recovery + items[1].recovery + items[2].recovery + items[3].recovery,
    items[0].discipline + items[1].discipline + items[2].discipline + items[3].discipline,
    items[0].intellect + items[1].intellect + items[2].intellect + items[3].intellect,
    items[0].strength + items[1].strength + items[2].strength + items[3].strength,
  ]
}

class OrderedList<T> {
  public list: T[] = [];
  // this list contains the comparator values for each entry
  private comparatorList: number[] = [];
  public length = 0;

  private comparator: (d: T) => number;

  constructor(comparator: (d: T) => number) {
    this.comparator = comparator;
  }

  public insert(value: T) {
    let compVal = this.comparator(value);
    let i;
    for (i = 0; i < this.list.length; i++) {
      if (this.comparatorList[i] > compVal)
        continue;
      break;
    }
    this.length++;
    this.list.splice(i, 0, value)
    this.comparatorList.splice(i, 0, compVal)
  }

  public remove(value: T) {
    let idx = -1;
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i] == value) {
        idx = i;
        break;
      }
    }
    if (idx != -1) {
      this.list.splice(idx, 1)
      this.comparatorList.splice(idx, 1)
      this.length--;
    }
  }
}

/**
 * Returns null, if the permutation is invalid.
 * This code does not utilize fancy filters and other stuff.
 * This results in ugly code BUT it is way way WAY faster!
 */
function handlePermutation(
  runtime: any,
  config: BuildConfiguration,
  helmet: IInventoryArmor,
  gauntlet: IInventoryArmor,
  chest: IInventoryArmor,
  leg: IInventoryArmor,
  constantBonus: number[],
  availableModCost: number[],
  doNotOutput = false
): any {
  const items = [helmet, gauntlet, chest, leg]

  var totalStatBonus = config.assumeClassItemMasterworked ? 2 : 0;

  for (let i = 0; i < items.length; i++) {
    let item = items[i];  // add masterworked value, if necessary
    if (item.masterworked
      || (item.isExotic && config.assumeExoticsMasterworked)
      || (!item.isExotic && config.assumeLegendariesMasterworked))
      totalStatBonus += 2;
  }

  const stats = getStatSum(items);
  stats[0] += totalStatBonus;
  stats[1] += totalStatBonus + (!items[2].isExotic && config.addConstant1Resilience ? 1 : 0);
  stats[2] += totalStatBonus;
  stats[3] += totalStatBonus;
  stats[4] += totalStatBonus;
  stats[5] += totalStatBonus;

  const statsWithoutMods = [stats[0], stats[1], stats[2], stats[3], stats[4], stats[5]]
  stats[0] += constantBonus[0];
  stats[1] += constantBonus[1];
  stats[2] += constantBonus[2];
  stats[3] += constantBonus[3];
  stats[4] += constantBonus[4];
  stats[5] += constantBonus[5];

  // Abort here if we are already above the limit, in case of fixed stat tiers
  for (let n: ArmorStat = 0; n < 6; n++)
    if (config.minimumStatTiers[n].fixed && (stats[n] / 10) >= config.minimumStatTiers[n].value + 1)
      return null;

  // required mods for each stat
  const requiredMods = [
    Math.ceil(Math.max(0, config.minimumStatTiers[0].value - stats[0] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTiers[1].value - stats[1] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTiers[2].value - stats[2] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTiers[3].value - stats[3] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTiers[4].value - stats[4] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTiers[5].value - stats[5] / 10)),
  ]

  const requiredModsTotal = requiredMods[0] + requiredMods[1] + requiredMods[2] + requiredMods[3] + requiredMods[4] + requiredMods[5]
  const usedMods: OrderedList<StatModifier> = new OrderedList<StatModifier>(d => STAT_MOD_VALUES[d][2])
  // only calculate mods if necessary. If we are already above the limit there's no reason to do the rest
  if (requiredModsTotal > 5) return null;

  let availableModCostLen = availableModCost.length;
  if (requiredModsTotal > availableModCostLen) return null;

  if (requiredModsTotal > 0) {
    // first, add mods that are necessary
    for (let statId = 0; statId < 6; statId++) {
      if (requiredMods[statId] == 0) continue;

      // Add a minor mod in favor of a major mod, if the stat number ends at 5, 6, 7, 8, or 9.
      // This saves slots AND reduces wasted stats.
      const statDifference = stats[statId] % 10;
      if (statDifference > 0 && statDifference % 10 >= 5) {
        usedMods.insert((1 + (statId * 2)) as StatModifier)

        requiredMods[statId]--;
        stats[statId] += 5
      }
      // Now fill the rest with major mods.
      for (let n = 0; n < requiredMods[statId]; n++) {
        usedMods.insert((2 + (statId * 2)) as StatModifier)
        stats[statId] += 10
      }
    }
    /**
     *  Now we know how many major mods we need.
     *  If the modslot limitation forces us to only use N major mods, we can simply replace
     *  a major mod with two minor mods.
     *  We'll do this until we either reach the usedMods length of 5 (the limit), or until all
     *  modslot limitations are satisfied.
     */
    for (let i = 0; i < usedMods.length && usedMods.length <= 5; i++) {
      const mod = usedMods.list[i];

      const cost = STAT_MOD_VALUES[mod][2];
      const availableSlots = availableModCost.filter(d => d >= cost);
      if (availableSlots.length == 0) {
        if (mod % 2 == 0) {
          // replace a major mod with two minor mods OR abort
          usedMods.remove(mod)
          let minorMod = mod - 1 as StatModifier;
          usedMods.insert(minorMod)
          usedMods.insert(minorMod)
          i--;
        } else {
          // cannot replace a minor mod, so this build is not possible
          return null;
        }
      } else {
        availableModCost.splice(availableModCost.indexOf(availableSlots[0]), 1)
        availableModCostLen--;
      }
    }
  }
  if (usedMods.length > 5) return null;

  // Check if we should add our results at all
  if (config.onlyShowResultsWithNoWastedStats) {
    // Definitely return when we encounter stats above 100
    if (stats.filter(d => d > 100).length > 0)
      return null;
    // definitely return when we encounter stats that can not be fixed
    if (stats.filter(d => d % 5 != 0).length > 0)
      return null;

    // now find out how many mods we need to fix our stats to 0 waste
    // Yes, this is basically duplicated code. But necessary.
    let waste = [
      stats[ArmorStat.Mobility],
      stats[ArmorStat.Resilience],
      stats[ArmorStat.Recovery],
      stats[ArmorStat.Discipline],
      stats[ArmorStat.Intellect],
      stats[ArmorStat.Strength]
    ].map((v, index) => [v % 10, index, v]).sort((a, b) => b[0] - a[0])

    for (let i = availableModCostLen - 1; i >= 0; i--) {
      let result = waste
        .filter(t => availableModCost.filter(d => d >= STAT_MOD_VALUES[(1 + (t[1] * 2)) as StatModifier][2]).length > 0)
        .filter(t => t[0] >= 5 && t[2] < 100)
        .sort((a, b) => a[0] - b[0])[0]
      if (!result) break;

      const modCost = availableModCost.filter(d => d >= STAT_MOD_VALUES[(1 + (result[1] * 2)) as StatModifier][2])[0]
      availableModCost.splice(availableModCost.indexOf(modCost), 1);
      availableModCostLen--;
      stats[result[1]] += 5
      result[0] -= 5;
      usedMods.insert(1 + 2 * result[1])
    }
    const waste1 = getWaste(stats);
    if (waste1 > 0)
      return null;
  }
  if (usedMods.length > 5)
    return null;


  // get maximum possible stat and write them into the runtime
  // Get maximal possible stats and write them in the runtime variable
  const maxBonus = 10 * availableModCostLen
  const maxBonus1 = 100 - 10 * availableModCostLen
  const possible100 = []
  for (let n = 0; n < 6; n++) {
    let maximum = stats[n]
    // can reach 100, so we want an effective way to find out how
    if (maximum >= maxBonus1) {
      possible100.push([n, 100 - maximum])
    }

    // TODO there is a bug here somefilter
    if (maximum + maxBonus >= runtime.maximumPossibleTiers[n]) {
      let minor = STAT_MOD_VALUES[(1 + (n * 2)) as StatModifier][2]
      let major = STAT_MOD_VALUES[(2 + (n * 2)) as StatModifier][2]
      for (let i = 0; i < availableModCostLen && maximum < 100; i++) {
        if (availableModCost[i] >= major) maximum += 10;
        if (availableModCost[i] >= minor && availableModCost[i] < major) maximum += 5;
      }
      if (maximum > runtime.maximumPossibleTiers[n])
        runtime.maximumPossibleTiers[n] = maximum
    }
  }

  if (availableModCostLen > 0 && possible100.length >= 3) {
    // validate if it is possible
    possible100.sort((a, b) => a[1] - b[1])

    // combinations...
    const comb3 = []
    for (let i1 = 0; i1 < possible100.length - 2; i1++) {
      let cost1 = ~~((Math.max(0, possible100[i1][1], 0) + 9) / 10);
      if (cost1 > availableModCostLen) break;

      for (let i2 = i1 + 1; i2 < possible100.length - 1; i2++) {
        let cost2 = ~~((Math.max(0, possible100[i2][1], 0) + 9) / 10);
        if (cost1 + cost2 > availableModCostLen) break;

        for (let i3 = i2 + 1; i3 < possible100.length; i3++) {
          let cost3 = ~~((Math.max(0, possible100[i3][1], 0) + 9) / 10);
          if (cost1 + cost2 + cost3 > availableModCostLen) break;


          var addedAs4x100 = false
          for (let i4 = i3 + 1; i4 < possible100.length; i4++) {
            let cost4 = ~~((Math.max(0, possible100[i4][1], 0) + 9) / 10);
            if (cost1 + cost2 + cost3 + cost4 > availableModCostLen) break;
            comb3.push([possible100[i1], possible100[i2], possible100[i3], possible100[i4]])
            addedAs4x100 = true;
          }
          if (!addedAs4x100)
            comb3.push([possible100[i1], possible100[i2], possible100[i3]])
        }
      }
    }


    for (let combination of comb3) {
      var requiredModCosts = [0, 0, 0, 0, 0, 0]
      let requiredModCostsCount = 0

      for (let i = 0; i < combination.length; i++) {
        if (combination[i][1] <= 0)
          continue
        const data = combination[i]
        const id = data[0]
        let minor = STAT_MOD_VALUES[(1 + (id * 2)) as StatModifier][2]
        let major = STAT_MOD_VALUES[(2 + (id * 2)) as StatModifier][2]

        const valueToOvercome = Math.max(0, data[1]);
        let amountMajor = ~~(valueToOvercome / 10);
        let amountMinor = valueToOvercome % 10;
        if (amountMinor > 5) {
          amountMajor++;
        } else if (amountMinor > 0) {
          requiredModCosts[minor]++;
          requiredModCostsCount++;
        }

        for (let k = 0; k < amountMajor; k++) {
          requiredModCosts[major]++;
          requiredModCostsCount++;
        }
      }
      const majorMapping = [0, 0, 0, 1, 2, 2]
      const usedCostIdx = [false, false, false, false, false]
      //if (combination.filter(d => d[0] == 4).length > 0) console.log("01", {usedCostIdx, possible100, combination, availableModCostLen, requiredModCosts, requiredModCostsCount})

      if (requiredModCostsCount > availableModCostLen)
        continue;

      for (let costIdx = 5; costIdx >= 3; costIdx--) {
        let costAmount = requiredModCosts[costIdx];
        if (costAmount == 0) continue
        let dat = availableModCost
          .map((d, i) => [d, i])
          .filter(([d, index]) => (!usedCostIdx[index]) && d >= costIdx)

        //if (combination.filter(d => d[0] == 4).length > 0)  console.log("01 >>","log",  costAmount, dat.length, dat, costAmount)
        let origCostAmount = costAmount
        for (let n = 0; (n < origCostAmount) && (n < dat.length); n++) {
          usedCostIdx[dat[n][1]] = true;
          costAmount--;
        }
        for (let n = 0; n < costAmount; n++) {
          requiredModCosts[costIdx]--;
          requiredModCosts[majorMapping[costIdx]] += 2;
          requiredModCostsCount++;
        }
        if (requiredModCostsCount > availableModCostLen)
          break;
      }
      // 3x100 possible
      if (requiredModCostsCount <= availableModCostLen) {
        runtime.statCombo3x100.add((1 << combination[0][0]) + (1 << combination[1][0]) + (1 << combination[2][0]));
        if (combination.length > 3)
          runtime.statCombo4x100.add((1 << combination[0][0]) + (1 << combination[1][0]) + (1 << combination[2][0]) + (1 << combination[3][0]));
      }
    }
  }

  if (doNotOutput) return "DONOTSEND";

  // Add mods to reduce stat waste
  if (config.tryLimitWastedStats && availableModCostLen > 0) {

    let waste = [
      stats[ArmorStat.Mobility],
      stats[ArmorStat.Resilience],
      stats[ArmorStat.Recovery],
      stats[ArmorStat.Discipline],
      stats[ArmorStat.Intellect],
      stats[ArmorStat.Strength]
    ].map((v, i) => [v % 10, i, v]).sort((a, b) => b[0] - a[0])

    for (let id = 0; id < availableModCostLen; id++) {
      let result = waste
        .filter(t => availableModCost.filter(d => d >= STAT_MOD_VALUES[(1 + (t[1] * 2)) as StatModifier][2]).length > 0)
        .filter(t => t[0] >= 5 && t[2] < 100)
        .sort((a, b) => a[0] - b[0])[0]
      if (!result) break;

      // Ignore this if it would bring us over the fixed stat tier
      if (config.minimumStatTiers[result[1] as ArmorStat].fixed && (stats[result[1]] + 5) / 10 >= config.minimumStatTiers[result[1] as ArmorStat].value + 1) {
        result[0] -= 5;
        continue;
      }

      const modCost = availableModCost.filter(d => d >= STAT_MOD_VALUES[(1 + (result[1] * 2)) as StatModifier][2])[0]
      availableModCost.splice(availableModCost.indexOf(modCost), 1);
      availableModCostLen--;
      stats[result[1]] += 5
      result[0] -= 5;
      usedMods.insert(1 + 2 * result[1])
    }
  }


  const waste1 = getWaste(stats);
  if (config.onlyShowResultsWithNoWastedStats && waste1 > 0)
    return null;

  const exotic = helmet.isExotic ? helmet : gauntlet.isExotic ? gauntlet : chest.isExotic ? chest : leg.isExotic ? leg : null
  return {
    exotic: exotic == null ? [] : [{
      icon: exotic?.icon,
      watermark: exotic?.watermarkIcon,
      name: exotic?.name,
      hash: exotic?.hash
    }],
    modCount: usedMods.length,
    modCost: usedMods.list.reduce((p, d: StatModifier) => p + STAT_MOD_VALUES[d][2], 0),
    mods: usedMods.list,
    stats: stats,
    statsNoMods: statsWithoutMods,
    tiers: getSkillTier(stats),
    waste: waste1,
    items: items.reduce((p: any, instance) => {
      p[instance.slot - 1].push({
        energy: instance.energyAffinity,
        energyLevel: instance.energyLevel,
        hash: instance.hash,
        itemInstanceId: instance.itemInstanceId,
        name: instance.name,
        exotic: !!instance.isExotic,
        masterworked: instance.masterworked,
        mayBeBugged: instance.mayBeBugged,
        slot: instance.slot,
        perk: instance.perk,
        transferState: 0, // TRANSFER_NONE
        stats: [
          instance.mobility, instance.resilience, instance.recovery,
          instance.discipline, instance.intellect, instance.strength
        ]
      })
      return p;
    }, [[], [], [], []])
  }
}


function getSkillTier(stats: number[]) {
  return Math.floor(Math.min(100, stats[ArmorStat.Mobility]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Resilience]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Recovery]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Discipline]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Intellect]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Strength]) / 10)
}

function getWaste(stats: number[]) {
  return (stats[ArmorStat.Mobility] > 100 ? stats[ArmorStat.Mobility] - 100 : stats[ArmorStat.Mobility] % 10)
    + (stats[ArmorStat.Resilience] > 100 ? stats[ArmorStat.Resilience] - 100 : stats[ArmorStat.Resilience] % 10)
    + (stats[ArmorStat.Recovery] > 100 ? stats[ArmorStat.Recovery] - 100 : stats[ArmorStat.Recovery] % 10)
    + (stats[ArmorStat.Discipline] > 100 ? stats[ArmorStat.Discipline] - 100 : stats[ArmorStat.Discipline] % 10)
    + (stats[ArmorStat.Intellect] > 100 ? stats[ArmorStat.Intellect] - 100 : stats[ArmorStat.Intellect] % 10)
    + (stats[ArmorStat.Strength] > 100 ? stats[ArmorStat.Strength] - 100 : stats[ArmorStat.Strength] % 10)
}
