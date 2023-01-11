import {Component, OnDestroy, OnInit} from '@angular/core';
import {ModInformation} from "../../../../data/ModInformation";
import {ModifierType} from "../../../../data/enum/modifierType";
import {Modifier, ModifierValue} from "../../../../data/modifier";
import {ArmorAffinityIcons, ArmorAffinityNames, ArmorStat, SpecialArmorStat} from "../../../../data/enum/armor-stat";
import {ConfigurationService} from "../../../../services/configuration.service";
import {CharacterClass} from "../../../../data/enum/character-Class";
import {ModOrAbility} from "../../../../data/enum/modOrAbility";
import {MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS} from "@angular/material/slide-toggle";
import {DestinyEnergyType} from 'bungie-api-ts/destiny2';
import {takeUntil} from "rxjs/operators";
import {Subject} from "rxjs";

@Component({
  selector: 'app-desired-mods-selection',
  templateUrl: './desired-mods-selection.component.html',
  styleUrls: ['./desired-mods-selection.component.scss'],
  providers: [
    {provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: {disableToggleValue: false, disableDragValue: true}},
  ]
})
export class DesiredModsSelectionComponent implements OnInit, OnDestroy {
  ModifierType = ModifierType;
  ModOrAbility = ModOrAbility;
  dataSource: Modifier[];
  displayedColumns = ["name", "cost", "mobility", "resilience", "recovery", "discipline", "intellect", "strength"];
  private selectedClass: CharacterClass = CharacterClass.None;
  data: { data: Modifier[]; name: string, group: boolean, type: ModifierType }[];
  selectedMods: ModOrAbility[] = [];
  selectedElement: ModifierType = ModifierType.Solar;
  retrofitCount : {[id:string]: number} = {
    [ModOrAbility.MobileRetrofit]: 0,
    [ModOrAbility.ResilientRetrofit]: 0,
  }

  constructor(private config: ConfigurationService) {
    const modifiers = Object.values(ModInformation).sort((a, b) => {
      if (a.name.toLowerCase() < b.name.toLowerCase()) {
        return -1;
      }
      if (a.name.toLowerCase() > b.name.toLowerCase()) {
        return 1;
      }
      return 0;
    });
    let combatStyleMods = modifiers.filter(value => value.type == ModifierType.CombatStyleMod);
    let stasisFragments = modifiers.filter(value => value.type == ModifierType.Stasis);
    let voidFragments = modifiers.filter(value => value.type == ModifierType.Void);
    let solarFragments = modifiers.filter(value => value.type == ModifierType.Solar);
    let arcFragments = modifiers.filter(value => value.type == ModifierType.Arc);

    this.data = [
      {name: "Combat Style Mods", data: combatStyleMods, group: false, type: ModifierType.CombatStyleMod},
      {name: "Stasis Fragments", data: stasisFragments, group: true, type: ModifierType.Stasis},
      {name: "Void Fragments", data: voidFragments, group: true, type: ModifierType.Void},
      {name: "Solar Fragments", data: solarFragments, group: true, type: ModifierType.Solar},
      {name: "Arc Fragments", data: arcFragments, group: true, type: ModifierType.Arc},
    ]

    this.dataSource = modifiers;
  }

  ngOnInit(): void {
    this.config.configuration
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(c => {
        this.selectedMods = c.enabledMods;
        this.selectedClass = c.characterClass;
        this.selectedElement = c.selectedModElement;
      })
  }


  getModifierTextForValue(value: ModifierValue[], type: ArmorStat | SpecialArmorStat) {
    return value.filter(v => {
      if (v.stat == type)
        return true;
      if (v.stat == SpecialArmorStat.ClassAbilityRegenerationStat) {
        if (this.selectedClass == CharacterClass.Titan && type == ArmorStat.Resilience) return true;
        if (this.selectedClass == CharacterClass.Hunter && type == ArmorStat.Mobility) return true;
        if (this.selectedClass == CharacterClass.Warlock && type == ArmorStat.Recovery) return true;
      }
      return false;
    }).reduce((p, v) => p + v.value, 0);
  }

  handleRowClick(row: Modifier) {
    this.config.modifyConfiguration(c => {
      const pos = c.enabledMods.indexOf(row.id);
      if (pos > -1) {
        c.enabledMods.splice(pos, 1)
      } else {
        // Do not allow more than 5 stat mods
        const amountStatMods = c.enabledMods.filter(d => ModInformation[d].requiredArmorAffinity != DestinyEnergyType.Any).length;
        if (row.requiredArmorAffinity == DestinyEnergyType.Any || amountStatMods < 5)
          c.enabledMods.push(row.id)
      }
    })
  }

  clear() {
    this.config.modifyConfiguration(c => {
      c.enabledMods = []
    })
  }

  getAffinityName(id: DestinyEnergyType) {
    return ArmorAffinityNames[id];
  }

  getAffinityUrl(id: DestinyEnergyType) {
    return ArmorAffinityIcons[id];
  }

  setRetrofitCount(type: ModOrAbility, count: number) {
    this.retrofitCount[type] = count;
    this.config.modifyConfiguration(c => {
      const pos = c.enabledMods.filter(m => m == type)

      // first, remove all mods of this type
      for (let toDisableMods of pos) {
        const position = c.enabledMods.indexOf(toDisableMods);
        c.enabledMods.splice(position, 1)
      }
      // now add count amount of mods
      for (let i = 0; i < count; i++) {
        c.enabledMods.push(type);
      }
    })
  }

  setElement(element: ModifierType) {
    if (this.selectedElement == element)
      return;
    this.config.modifyConfiguration(c => {
      const pos = c.enabledMods
        .filter(m => ModInformation[m].type != ModifierType.CombatStyleMod && ModInformation[m].type != element)

      c.selectedModElement = element;

      for (let toDisableMods of pos) {
        const position = c.enabledMods.indexOf(toDisableMods);
        c.enabledMods.splice(position, 1)
      }
    })
  }

  private ngUnsubscribe = new Subject();

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }
}
