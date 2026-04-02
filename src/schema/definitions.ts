/**
 * Interface defining the database schema structure used by the MCP tools.
 * This allows abstracting table and column names for different WoW expansions.
 */
export interface SchemaDefinition {
  auth: {
    account: {
      table: string;
      id: string;
      username: string;
      sha_pass_hash: string;
      email: string;
      last_login: string;
      dp: string; // Donation points / Battle Pay
    };
    account_access: {
      table: string;
      id: string; // Account ID
      gmlevel: string;
      RealmID: string;
    };
  };
  world: {
    creature_template: {
      table: string;
      entry: string;
      name: string;
      subname: string;
      minlevel: string;
      maxlevel: string;
      faction_A: string;
      faction_H: string;
      npcflag: string;
      npcflag2: string;
      gossip_menu_id: string;
    };
    quest_template: {
      table: string;
      id: string;
      title: string;
      level: string;
      min_level: string;
      max_level: string;
      reward_xp: string;
      reward_money: string;
      reward_honor: string;
      type: string;
    };
    item_template: {
      table: string;
      id: string;
      name: string;
      quality: string;
      item_level: string;
      required_level: string;
      class: string;
      subclass: string;
    };
  };
}

/**
 * Baseline schema mapping for WoW Server (MoP/Cata based on TrinityCore).
 */
export const MoPSchema: SchemaDefinition = {
  auth: {
    account: {
      table: 'account',
      id: 'id',
      username: 'username',
      sha_pass_hash: 'sha_pass_hash',
      email: 'email',
      last_login: 'last_login',
      dp: 'dp',
    },
    account_access: {
      table: 'account_access',
      id: 'id',
      gmlevel: 'gmlevel',
      RealmID: 'RealmID',
    },
  },
  world: {
    creature_template: {
      table: 'creature_template',
      entry: 'entry',
      name: 'name',
      subname: 'subname',
      minlevel: 'minlevel',
      maxlevel: 'maxlevel',
      faction_A: 'faction_A',
      faction_H: 'faction_H',
      npcflag: 'npcflag',
      npcflag2: 'npcflag2',
      gossip_menu_id: 'gossip_menu_id',
    },
    quest_template: {
      table: 'quest_template',
      id: 'Id',
      title: 'Title',
      level: 'Level',
      min_level: 'MinLevel',
      max_level: 'MaxLevel',
      reward_xp: 'RewardXPId',
      reward_money: 'RewardOrRequiredMoney',
      reward_honor: 'RewardHonor',
      type: 'Type',
    },
    item_template: {
      table: 'item_template',
      id: 'entry',
      name: 'name',
      quality: 'Quality',
      item_level: 'ItemLevel',
      required_level: 'RequiredLevel',
      class: 'class',
      subclass: 'subclass',
    },
  },
};
