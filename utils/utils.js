// @ts-check
const Discord = require("discord.js"),
  { escapeMarkdown, ComponentType } = require('discord.js'),
  sf = require("../config/snowflakes.json"),
  tsf = require("../config/snowflakes-testing.json"),
  csf = require("../config/snowflakes-testing-commands.json"),
  db = require("../database/dbControllers.js"),
  config = require("../config/config.json");

const errorLog = new Discord.WebhookClient(config.error);
const { nanoid } = require("nanoid");

/**
 * @typedef {Object} ParsedInteraction
 * @property {String | null} command - The command issued, represented as a string.
 * @property {Array} data - Associated data for the command, such as command options or values selected.
 */

/**
 * Converts an interaction into a more universal format for error messages.
 * @param {Discord.Interaction} int The interaction to be parsed.
 * @returns {ParsedInteraction} The interaction after it has been broken down.
 */
function parseInteraction(int) {
  if (int.isChatInputCommand() || int.isAutocomplete()) {
    let command = "";
    if (int.isAutocomplete()) command += "Autocomplete for ";
    command += "/";
    const sg = int.options.getSubcommandGroup(false);
    const sc = int.options.getSubcommand(false);
    if (sg) command += sg;
    command += int.commandName;
    if (sc) command += sc;
    return {
      command,
      data: [...int.options.data]
    };
  } else if (int.isContextMenuCommand()) {
    return {
      command: (int.isUserContextMenuCommand() ? "User" : "Message") + " Context " + int.commandName,
      data: [...int.options.data]
    };
  } else if (int.isMessageComponent()) {
    const data = [
      {
        name: "Type",
        value: Discord.ComponentType[int.componentType]
      }
    ];
    if (int.isAnySelectMenu()) {
      data.push({
        name: "Value(s)",
        value: int.values.join(', ')
      });
    }
    return { command: null, data };
  } else {
    // Modal is the only one left
    const data = [
      {
        name: "Type",
        value: "Modal"
      },
      {
        name: "Value(s)",
        value: int.fields.fields.map(f => `id: ${f.customId}, value: ${f.value}`)
      }
    ];
    return { command: null, data };
  }
}

const utils = {
  /**
   * TEMPORARY FOR TESTING I5.5 LIVE. REPLACES msg.channel.send and msg.reply. make a note of which it changes.
   */
  testingSend: (msg, payload) => msg.client.getPublicThread(utils.sf.channels.announcements)?.send(payload),
  /**
   * If a command is run in a channel that doesn't want spam, returns #bot-lobby so results can be posted there.
   * @param {Discord.Message} msg The Discord message to check for bot spam.
   */
  botSpam: function(msg) {
    if (msg.inGuild() && msg.guild?.id === utils.sf.ldsg && // Is in server
      ![utils.sf.channels.botspam, utils.sf.channels.bottesting].includes(msg.channelId) && // Isn't in the correct channel
      msg.channel.parentId !== utils.sf.channels.staffCategory) { // Isn't in the staff category

      msg.reply(`I've placed your results in <#${utils.sf.channels.botspam}> to keep things nice and tidy in here. Hurry before they get cold!`)
        .then(utils.clean);
      return msg.guild.channels.cache.get(utils.sf.channels.botspam);
    } else {
      return msg.channel;
    }
  },
  /**
   * After the given amount of time, attempts to delete the message.
   * @param {Discord.Message|Discord.Interaction} msg The message to delete.
   * @param {number} t The length of time to wait before deletion, in milliseconds.
   */
  clean: async function(msg, t = 20000) {
    if (msg instanceof Discord.AutocompleteInteraction) return;
    await utils.wait(t);
    if ("deleteReply" in msg) {
      if (msg.ephemeral || !msg.replied) return; // Can't delete ephemeral interactions
      msg.deleteReply().catch(utils.noop);
    } else if (msg.deletable) {
      msg.delete().catch(utils.noop);
      return msg;
    }
    return;
  },
  /** * Shortcut to Discord.Collection. See docs there for reference. */
  Collection: Discord.Collection,
  /**
   * Shortcut to a Message action row component builder
   * @return {Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>}
   */
  MsgActionRow: () => new Discord.ActionRowBuilder(),
  /**
   * Shortcut to a Modal action row component builder
   * @return {Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>}
   */
  ModalActionRow: () => new Discord.ActionRowBuilder(),
  Attachment: Discord.AttachmentBuilder,
  Button: Discord.ButtonBuilder,
  SelectMenu: {
    Channel: Discord.ChannelSelectMenuBuilder,
    Mentionable: Discord.MentionableSelectMenuBuilder,
    Role: Discord.RoleSelectMenuBuilder,
    String: Discord.StringSelectMenuBuilder,
    User: Discord.UserSelectMenuBuilder
  },
  Modal: Discord.ModalBuilder,
  TextInput: Discord.TextInputBuilder,
  /**
   * Confirm Dialog
   * @function confirmInteraction
   * @param {Discord.Interaction<Omit<Discord.CacheType, "undefined">>} interaction The interaction to confirm
   * @param {String} prompt The prompt for the confirmation
   * @returns {Promise<Boolean|null>}
   */
  confirmInteraction: async (interaction, prompt = "Are you sure?", title = "Confirmation Dialog") => {
    if (interaction.isAutocomplete()) return null;
    const embed = utils.embed({ author: (interaction.inGuild() && interaction.inCachedGuild() ? interaction.member : null) ?? interaction.user })
      .setColor(0xff0000)
      .setTitle(title)
      .setDescription(prompt);
    const confirmTrue = utils.customId(),
      confirmFalse = utils.customId();

    const components = [
      utils.MsgActionRow().addComponents(
        new Discord.ButtonBuilder().setCustomId(confirmTrue).setEmoji("✅").setLabel("Confirm").setStyle(Discord.ButtonStyle.Success),
        new Discord.ButtonBuilder().setCustomId(confirmFalse).setEmoji("⛔").setLabel("Cancel").setStyle(Discord.ButtonStyle.Danger)
      )
    ];

    if (interaction.replied) await interaction.editReply({ embeds: [embed], components, content: null });
    else await interaction.reply({ embeds: [embed], components, ephemeral: true });

    const confirm = await interaction.channel?.awaitMessageComponent({
      filter: (button) => button.user.id === interaction.user.id && (button.customId === confirmTrue || button.customId === confirmFalse),
      componentType: ComponentType.Button,
      time: 60000
    }).catch(() => ({ customId: "confirmTimeout" }));

    if (confirm?.customId === confirmTrue) return true;
    else if (confirm?.customId === confirmFalse) return false;
    else return null;
  },
  // awaitDm has been removed as we have better ways of doing that now
  /** Shortcut to databse controllers */
  db: db,
  /** Shortcut to nanoid. See docs there for reference. */
  customId: nanoid,
  /** Shortcut to Discord.Util.escapeMarkdown. See docs there for reference. */
  escapeText: escapeMarkdown,
  /**
   * Returns a MessageEmbed with basic values preset, such as color and timestamp.
   * You can override the color and timestamp here as well.
   * @param {Discord.EmbedData|Discord.APIEmbed|Discord.Embed|{author: Discord.GuildMember|Discord.User}} [data] The data object to pass to the MessageEmbed constructor.
   */
  embed: function(data = {}) {
    /** @type {Discord.EmbedData|Discord.APIEmbed} */
    let d;
    if (data instanceof Discord.Embed) {
      d = data.toJSON();
    } else {
      let data2 = {};
      if (data.author instanceof Discord.GuildMember || data.author instanceof Discord.User) {
        data.author = { name: data.author.displayName, iconURL: data.author.displayAvatarURL() };
      }
      // Yes it has to be this way. Yes I hate it too.
      data2 = data;
      d = data2;
    }

    const embed = new Discord.EmbedBuilder(d);
    if (!d.color) embed.setColor(parseInt(config.color));
    if (!d.timestamp) embed.setTimestamp();
    return embed;
  },
  /**
   * Handles a command exception/error. Most likely called from a catch.
   * Reports the error and lets the user know.
   * @param {Error|string} [error] The error to report.
   * @param {Discord.Message|Discord.Interaction|string} [message] Any Discord.Message, Discord.BaseInteraction, or text string.
   */
  errorHandler: function(error, message, clean = true) {
    if (!error || (error instanceof Error && error.name === "AbortError")) return;
    console.error(Date());

    const embed = utils.embed().setTitle(error instanceof Error ? error?.name?.toString() ?? "Error" : error);

    if (message instanceof Discord.Message) {
      const loc = (message.inGuild() ? `${message.guild?.name} > ${message.channel?.name}` : "DM");
      console.error(`${message.author.username} in ${loc}: ${message.cleanContent}`);

      // message.channel.send("I've run into an error. I've let my devs know.").then(m => {
      utils.testingSend(message, "I've run into an error. I've let my devs know.").then(m => {
        if (clean) utils.clean(m);
      });
      embed.addFields(
        { name: "User", value: message.author.username, inline: true },
        { name: "Location", value: loc, inline: true },
        { name: "Command", value: message.cleanContent || "`undefined`", inline: true }
      );
    } else if (message instanceof Discord.BaseInteraction) {
      const loc = (message.inGuild() ? `${message.guild?.name} > ${message.channel?.name}` : "DM");
      console.error(`Interaction by ${message.user.username} in ${loc}`);

      // alert the user
      if (!message.isAutocomplete()) {
        if (message.replied) {
          message.editReply("I've run into an error. I've let my devs know.").then(m => {
            if (clean) utils.clean(m);
          });
        } else {
          message.reply({ content: "I've run into an error. I've let my devs know.", ephemeral: true }).catch(utils.noop);
        }
      }
      embed.addFields(
        { name: "User", value: message.user?.username, inline: true },
        { name: "Location", value: loc, inline: true }
      );

      const descriptionLines = [message.isCommand() || message.isAutocomplete() ? message.commandId : message.customId || "`undefined`"];
      const { command, data } = parseInteraction(message);
      if (command) descriptionLines.push(command);
      for (const datum of data) {
        descriptionLines.push(`${datum.name}: ${datum.value}`);
      }
      embed.addFields({ name: "Interaction", value: descriptionLines.join("\n") });
    } else if (typeof message === "string") {
      console.error(message);
      embed.addFields({ name: "Message", value: message });
    }

    if (typeof error != 'string') {
      console.trace(error);

      let stack = (error.stack ? error.stack : error.toString());
      if (stack.length > 4096) stack = stack.slice(0, 4000);
      embed.setDescription(stack);
    }

    errorLog.send({ embeds: [embed] });
  },
  errorLog,
  /**
   * This task is extremely complicated.
   * You need to understand it perfectly to use it.
   * It took millenia to perfect, and will take millenia
   * more to understand, even for scholars.
   *
   * It does literally nothing.
   * */
  noop: () => {
    // No-op, do nothing
  },
  /**
   * Returns an object containing the command, suffix, and params of the message.
   * @param {Discord.Message} msg The message to get command info from.
   * @param {boolean} clean Whether to use the messages cleanContent or normal content. Defaults to false.
   */
  parse: (msg, clean = false) => {
    for (const prefix of [config.prefix, `<@${msg.client.user.id}>`, `<@!${msg.client.user.id}>`]) {
      const content = clean ? msg.cleanContent : msg.content;
      if (!content.startsWith(prefix)) continue;
      const trimmed = content.substr(prefix.length).trim();
      let [command, ...params] = trimmed.split(" ");
      if (command) {
        let suffix = params.join(" ");
        if (suffix.toLowerCase() === "help") { // Allow `!command help` syntax
          const t = command.toLowerCase();
          command = "help";
          suffix = t;
          params = t.split(" ");
        }
        return {
          command: command.toLowerCase(),
          suffix,
          params
        };
      }
    }
    return null;
  },
  /**
   * Choose a random element from an array
   * @template K
   * @param {K[]} selections
   * @returns {K}
   */
  rand: function(selections) {
    return selections[Math.floor(Math.random() * selections.length)];
  },
  /**
   * Convert to a fancier time string
   * @param {Date} time The input time
   * @param {Discord.TimestampStylesString} format The format to display in
   * @returns {string} "<t:time:format>"
   */
  time: function(time, format = "f") {
    return Discord.time(time, format);
  },
  /** Shortcut to snowflakes.json or snowflakes-testing.json depending on if devMode is turned on */
  sf: config.devMode ? Object.assign(tsf, csf) : sf,

  /**
   * Returns a promise that will fulfill after the given amount of time.
   * If awaited, will block for the given amount of time.
   * @param {number} t The time to wait, in milliseconds.
   */
  wait: function(t) {
    return new Promise((fulfill) => {
      setTimeout(fulfill, t);
    });
  },
  /**
   * @template T
   * @param {T[]} items
   * @returns {T[]}
   */
  unique: function(items) {
    return [...new Set(items)];
  }
};

module.exports = utils;
