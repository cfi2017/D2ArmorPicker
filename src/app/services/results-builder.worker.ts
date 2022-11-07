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

  let exoticId = config.selectedExotics[0] || 0
  let requirements = constantModslotRequirement.slice()
  let no_exotic = exoticId <= 0;
  if ((no_exotic || (helmet.hash != exoticId))
    && config.armorPerks[ArmorSlot.ArmorSlotHelmet].fixed && config.armorPerks[ArmorSlot.ArmorSlotHelmet].value != ArmorPerkOrSlot.None
    && config.armorPerks[ArmorSlot.ArmorSlotHelmet].value != helmet.perk)
    return {valid: false};
  if ((no_exotic || (gauntlet.hash != exoticId))
    && config.armorPerks[ArmorSlot.ArmorSlotGauntlet].fixed && config.armorPerks[ArmorSlot.ArmorSlotGauntlet].value != ArmorPerkOrSlot.None
    && config.armorPerks[ArmorSlot.ArmorSlotGauntlet].value != gauntlet.perk)
    return {valid: false};
  if ((no_exotic || (chest.hash != exoticId))
    && config.armorPerks[ArmorSlot.ArmorSlotChest].fixed && config.armorPerks[ArmorSlot.ArmorSlotChest].value != ArmorPerkOrSlot.None
    && config.armorPerks[ArmorSlot.ArmorSlotChest].value != chest.perk)
    return {valid: false};
  if ((no_exotic || (leg.hash != exoticId))
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
  } else if (config.armorPerks[ArmorSlot.ArmorSlotClass].fixed) {
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
  let constantModslotRequirement = []
  for (let n = 0; n < ArmorPerkOrSlot.COUNT; n++) constantModslotRequirement.push(0)

  constantModslotRequirement[config.armorPerks[ArmorSlot.ArmorSlotHelmet].value]++;
  constantModslotRequirement[config.armorPerks[ArmorSlot.ArmorSlotChest].value]++;
  constantModslotRequirement[config.armorPerks[ArmorSlot.ArmorSlotGauntlet].value]++;
  constantModslotRequirement[config.armorPerks[ArmorSlot.ArmorSlotLegs].value]++;
  constantModslotRequirement[config.armorPerks[ArmorSlot.ArmorSlotClass].value]++;
  return constantModslotRequirement;
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
      for (let chest of chests) {
        for (let leg of legs) {
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

function get_required_mod_costs(combination: number[][]): [number[], number] {
  let requiredModCosts = [ 0, 0, 0, 0, 0, 0 ]
  let requiredModCostsCount = 0

  // for each stat in this combination
  // calculate how many mods we need to get them to 100 and what the cost
  for (let [ statId, needed ] of combination) {
    // if we're at 100 ignore the checks and continue
    if (needed <= 0) {
      continue
    }

    // minor and major costs for the selected stat
    let minor = STAT_MOD_VALUES[(1 + (statId * 2)) as StatModifier][2]
    let major = STAT_MOD_VALUES[(2 + (statId * 2)) as StatModifier][2]

    // truncate the needed stats if it's below 0
    const valueToOvercome = Math.max(0, needed);
    // divide by 10, rounding down
    let amountMajor = ~~(valueToOvercome / 10);
    // check if we have more than 5 remaining
    let amountMinor = valueToOvercome % 10;
    if (amountMinor > 5) {
      // if yes we need another major mod
      amountMajor++;
    } else if (amountMinor > 0) {
      // else we're fine with another minor mod
      requiredModCosts[minor]++;
      requiredModCostsCount++;
    }

    // add major mods
    requiredModCosts[major] += amountMajor;
    requiredModCostsCount += amountMajor;
  }
  return [requiredModCosts, requiredModCostsCount];
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
  mod_slots_energy_capacity: number[], // this is sorted
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

  const required_mod_slots = requiredMods[0] + requiredMods[1] + requiredMods[2] + requiredMods[3] + requiredMods[4] + requiredMods[5]
  // list of stat modifiers (e.g. major resilience mod) sorted by cost
  const usedMods: OrderedList<StatModifier> = new OrderedList<StatModifier>(d => STAT_MOD_VALUES[d][2])
  // only calculate mods if necessary. If we are already above the limit there's no reason to do the rest
  if (required_mod_slots > 5) return null;

  // count of any mod slots that still have capacity (1+)
  let available_mod_slots = mod_slots_energy_capacity.length;

  // if we need more mods than are available then return
  if (required_mod_slots > available_mod_slots) return null;

  // if we need any more mods check if we can fit them now
  if (required_mod_slots > 0) {
    // first, add mods that are necessary
    for (let statId = 0; statId < 6; statId++) {
      if (requiredMods[statId] == 0) continue;

      // Add a minor mod in favor of a major mod, if the stat number ends at 5, 6, 7, 8, or 9.
      // This saves slots AND reduces wasted stats.
      const statDifference = stats[statId] % 10;
      if (statDifference > 0 && statDifference >= 5) {
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
    for (let i = 0; i < usedMods.length && usedMods.length < 5; i++) {
      const mod = usedMods.list[i];

      const cost = STAT_MOD_VALUES[mod][2];
      // todo: this is likely more performant with a traditional loop and a break statement
      const availableSlots = mod_slots_energy_capacity.filter(d => d >= cost);
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
        mod_slots_energy_capacity.splice(mod_slots_energy_capacity.indexOf(availableSlots[0]), 1)
        available_mod_slots--;
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

    // now find out how many mods we need to fix our stats to 0 stats_wasted
    // Yes, this is basically duplicated code. But necessary.
    let stats_wasted = [
      stats[ArmorStat.Mobility],
      stats[ArmorStat.Resilience],
      stats[ArmorStat.Recovery],
      stats[ArmorStat.Discipline],
      stats[ArmorStat.Intellect],
      stats[ArmorStat.Strength]
    ].map((v, index) => [v % 10, index, v]).sort((a, b) => b[0] - a[0])
    // arr of [stats_wasted, statId, total] tuples sorted by stats_wasted descending

    // iterate backwards
    for (let i = available_mod_slots - 1; i >= 0; i--) {
      let result = stats_wasted
        // any waste stats where the waste is 5 or higher and the total stat is under 100 (else our minor mod would result in wasted stats)
        // any stats that are waste we can solve (5)
        .filter(t => t[0] === 5)
        // any waste stats with a minor mod cost low enough that we have a slot to fill them with => there is a slot that has enough capacity for this stats minor cost
        .filter(t => mod_slots_energy_capacity.filter(d => d >= STAT_MOD_VALUES[(1 + (t[1] * 2)) as StatModifier][2]).length > 0)
        .sort((a, b) => a[0] - b[0])[0]
      // todo: verify
      // if we can't find an improvement just break
      if (!result) break; // ?

      // since we have a result we can improve
      // find the first slot we could use to improve this (the capacity array is sorted so the first result will also be the most efficient)
      // todo: replace this with a for loop
      const modCost = mod_slots_energy_capacity.filter(d => d >= STAT_MOD_VALUES[(1 + (result[1] * 2)) as StatModifier][2])[0]

      // that slot is no longer available, remove it
      mod_slots_energy_capacity.splice(mod_slots_energy_capacity.indexOf(modCost), 1);
      // we have one less slot available
      available_mod_slots--;
      // we added a minor mod so increase our stat
      stats[result[1]] += 5
      // remove five from the stats_wasted tuple, so it doesn't get caught in the next iteration
      result[0] -= 5;
      // we used another mod
      usedMods.insert(1 + 2 * result[1])
    }
    const waste1 = getWaste(stats); // get wasted stats total
    if (waste1 > 0) // we above 0 wasted?
      return null; // uh-oh
  } // end making sure we have no wasted stats
  if (usedMods.length > 5)
    return null;


  // get maximum possible stat and write them into the runtime
  // Get maximal possible stats and write them in the runtime variable
  const maxBonus = 10 * available_mod_slots
  const maxBonus1 = 100 - 10 * available_mod_slots
  const possible100 = []
  for (let n = 0; n < 6; n++) {
    let maximum = stats[n]
    // can reach 100, so we want an effective way to find out how
    if (maximum >= maxBonus1) {
      possible100.push([n, 100 - maximum])
    }

    // TODO there is a bug here somewhere
    if (maximum + maxBonus >= runtime.maximumPossibleTiers[n]) {
      let minor = STAT_MOD_VALUES[(1 + (n * 2)) as StatModifier][2]
      let major = STAT_MOD_VALUES[(2 + (n * 2)) as StatModifier][2]
      for (let i = 0; i < available_mod_slots && maximum < 100; i++) {
        if (mod_slots_energy_capacity[i] >= major) maximum += 10;
        if (mod_slots_energy_capacity[i] >= minor && mod_slots_energy_capacity[i] < major) maximum += 5;
      }
      if (maximum > runtime.maximumPossibleTiers[n])
        runtime.maximumPossibleTiers[n] = maximum
    }
  }

  if (available_mod_slots > 0 && possible100.length >= 3) {
    // validate if it is possible
    possible100.sort((a, b) => a[1] - b[1])

    // combinations...
    const comb3 = []
    for (let i1 = 0; i1 < possible100.length - 2; i1++) {
      let cost1 = ~~((Math.max(0, possible100[i1][1], 0) + 9) / 10);
      if (cost1 > available_mod_slots) break;

      for (let i2 = i1 + 1; i2 < possible100.length - 1; i2++) {
        let cost2 = ~~((Math.max(0, possible100[i2][1], 0) + 9) / 10);
        if (cost1 + cost2 > available_mod_slots) break;

        for (let i3 = i2 + 1; i3 < possible100.length; i3++) {
          let cost3 = ~~((Math.max(0, possible100[i3][1], 0) + 9) / 10);
          if (cost1 + cost2 + cost3 > available_mod_slots) break;


          var addedAs4x100 = false
          for (let i4 = i3 + 1; i4 < possible100.length; i4++) {
            let cost4 = ~~((Math.max(0, possible100[i4][1], 0) + 9) / 10);
            if (cost1 + cost2 + cost3 + cost4 > available_mod_slots) break;
            comb3.push([possible100[i1], possible100[i2], possible100[i3], possible100[i4]])
            addedAs4x100 = true;
          }
          if (!addedAs4x100)
            comb3.push([possible100[i1], possible100[i2], possible100[i3]])
        }
      }
    }


    // for each potential x3 or x4
    for (let combination of comb3) {
      // this denotes costs for mods that we need to fulfil a x3 or x4
      let [requiredModCosts, requiredModCostsCount] = get_required_mod_costs(combination);
      let used_modslots_indexes = 0;
      //if (combination.filter(d => d[0] == 4).length > 0) console.log("01", {usedCostIdx, possible100, combination, available_mod_slots, requiredModCosts, requiredModCostsCount})

      // if we need more mod slots than we have available this combination isn't possible
      if (requiredModCostsCount > available_mod_slots)
        continue;

      // iterate through costs backwards, stopping at 3? 2 and 1 are minor mods ig? // todo: verify
      for (let costIdx = 5; costIdx >= 3; costIdx--) {
        let costAmount = requiredModCosts[costIdx];
        if (costAmount == 0) continue // continue if we don't need any mods here

        // get a list of any slots that both have the capacity we need and have not been used to theoretically cover a slot
        let available_modslots = mod_slots_energy_capacity
          .map((d, i) => [d, i]) // map to capacity and index
          .filter(([d, index]) => (!(used_modslots_indexes & (1 << index)) && d >= costIdx))
          // .filter(([d, index]) => (!usedCostIdx[index]) && d >= costIdx) // any slots that have not been used in a previous iteration of the for loop and that have sufficient cost to cover us

        //if (combination.filter(d => d[0] == 4).length > 0)  console.log("01 >>","log",  costAmount, available_modslots.length, available_modslots, costAmount)
        let origCostAmount = costAmount
        // for either 0..costAmount or 0..available_modslots.length set
        for (let n = 0; (n < origCostAmount) && (n < available_modslots.length); n++) {
          let index = available_modslots[n][1];
          used_modslots_indexes = used_modslots_indexes | (1 << index);
          costAmount--; // reduce cost amount by one
        }
        // maybe we can fill stuff with minor mods?
        requiredModCosts[costIdx] -= costAmount;
        requiredModCosts[Math.floor(costIdx / 2)] += 2 * costAmount;
        requiredModCostsCount += costAmount;
        // if we have mod mods than are available quit while we're ahead
        if (requiredModCostsCount > available_mod_slots)
          break;
      }

      // if we have
      // 3x100 possible
      if (requiredModCostsCount <= available_mod_slots) {
        runtime.statCombo3x100.add((1 << combination[0][0]) + (1 << combination[1][0]) + (1 << combination[2][0]));
        if (combination.length > 3)
          runtime.statCombo4x100.add((1 << combination[0][0]) + (1 << combination[1][0]) + (1 << combination[2][0]) + (1 << combination[3][0]));
      }
    }
  }

  if (doNotOutput) return "DONOTSEND";

  // Add mods to reduce stat waste
  if (config.tryLimitWastedStats && available_mod_slots > 0) {

    let waste = [
      stats[ArmorStat.Mobility],
      stats[ArmorStat.Resilience],
      stats[ArmorStat.Recovery],
      stats[ArmorStat.Discipline],
      stats[ArmorStat.Intellect],
      stats[ArmorStat.Strength]
    ].map((v, i) => [v % 10, i, v]).sort((a, b) => b[0] - a[0])
    // waste is an array of tuples: [waste, stat_id, value]
    for (let id = 0; id < available_mod_slots; id++) {
      // likely also optimisable with a for loop
      let result = waste
        // any waste stats with a minor mod cost low enough that we have a slot to fill them with => there is a slot that has enough capacity for this stats minor cost
        .filter(t => mod_slots_energy_capacity.filter(d => d >= STAT_MOD_VALUES[(1 + (t[1] * 2)) as StatModifier][2]).length > 0)
        //
        .filter(([waste, _, value]) => waste >= 5 && value < 100)
        .sort((a, b) => a[0] - b[0])[0]
      if (!result) break;

      // Ignore this if it would bring us over the fixed stat tier
      let stat_id = result[1];
      if (config.minimumStatTiers[stat_id as ArmorStat].fixed && (stats[stat_id] + 5) / 10 >= config.minimumStatTiers[stat_id as ArmorStat].value + 1) {
        result[0] -= 5;
        continue;
      }

      const modCost = mod_slots_energy_capacity.filter(d => d >= STAT_MOD_VALUES[(1 + (stat_id * 2)) as StatModifier][2])[0]
      mod_slots_energy_capacity.splice(mod_slots_energy_capacity.indexOf(modCost), 1);
      available_mod_slots--;
      stats[stat_id] += 5
      result[0] -= 5;
      usedMods.insert(1 + 2 * stat_id)
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
