const Discord = require("discord.js"),
  { escapeMarkdown, ComponentType } = require('discord.js'),
  sf = require("../config/snowflakes.json"),
  tsf = require("../config/snowflakes-testing.json"),
  csf = require("../config/snowflakes-testing-commands.json"),
  db = require("../database/dbControllers.js"),
  p = require('./perms.js'),
  config = require("../config/config.json");

const errorLog = new Discord.WebhookClient(config.error);
const { nanoid } = require("nanoid");

/**
 * @typedef {Object} ParsedInteraction
 * @property {String} command - The command issued, represented as a string.
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
      data: int.options.data
    };
  } else if (int.isContextMenuCommand()) {
    return {
      command: (int.isUserContextMenuCommand() ? "User" : "Message") + " Context " + int.commandName,
      data: int.options.data
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
  }
}

const utils = {
  /**
   * If a command is run in a channel that doesn't want spam, returns #bot-lobby so results can be posted there.
   * @param {Discord.Message} msg The Discord message to check for bot spam.
   */
  botSpam: function(msg) {
    if (msg.guild?.id === utils.sf.ldsg && // Is in server
      msg.channel.id !== utils.sf.channels.botspam && // Isn't in bot-lobby
      msg.channel.id !== utils.sf.channels.bottesting && // Isn't in Bot Testing
      msg.channel.parentID !== utils.sf.channels.staffCategory) { // Isn't in the moderation category

      msg.reply(`I've placed your results in <#${utils.sf.channels.botspam}> to keep things nice and tidy in here. Hurry before they get cold!`)
        .then(utils.clean);
      return msg.guild.channels.cache.get(utils.sf.channels.botspam);
    } else {
      return msg.channel;
    }
  },
  /**
   * After the given amount of time, attempts to delete the message.
   * @param {Discord.Message|Discord.APIMessage|Discord.BaseInteraction} msg The message to delete.
   * @param {number} t The length of time to wait before deletion, in milliseconds.
   */
  clean: async function(msg, t = 20000) {
    await utils.wait(t);
    if (msg instanceof Discord.CommandInteraction) {
      msg.deleteReply().catch(utils.noop);
    } else if ((msg instanceof Discord.Message) && msg.deletable) {
      msg.delete().catch(utils.noop);
    }
    return Promise.resolve(msg);
  },
  /**
   * After the given amount of time, attempts to delete the interaction.
   * @param {Discord.BaseInteraction} interaction The interaction to delete.
   * @param {number} t The length of time to wait before deletion, in milliseconds.
   */
  cleanInteraction: async function(interaction, t = 20000) {
    if (interaction.ephemeral) { return; } // Can't delete ephemeral interactions.
    await utils.wait(t);
    interaction.deleteReply();
  },
  /**
   * Shortcut to Discord.Collection. See docs there for reference.
   */
  Collection: Discord.Collection,
  actionRow: Discord.ActionRowBuilder,
  button: Discord.ButtonBuilder,
  stringSelectMenu: Discord.StringSelectMenuBuilder,
  userSelectMenu: Discord.UserSelectMenuBuilder,
  roleSelectMenu: Discord.RoleSelectMenuBuilder,

  modal: Discord.ModalBuilder,
  /** @param {Discord.APITextInputComponent} data */
  textInput: (data) => new Discord.TextInputBuilder(data),
  /**
   * Confirm Dialog
   * @function confirmInteraction
   * @param {Discord.BaseInteraction} interaction The interaction to confirm
   * @param {String} prompt The prompt for the confirmation
   * @returns {Promise<Boolean>}
   */
  confirmInteraction: async (interaction, prompt = "Are you sure?", title = "Confirmation Dialog") => {
    const reply = (interaction.deferred || interaction.replied) ? "editReply" : "reply";
    const embed = utils.embed({ author: interaction.member ?? interaction.user })
      .setColor(0xff0000)
      .setTitle(title)
      .setDescription(prompt);
    const confirmTrue = utils.customId(),
      confirmFalse = utils.customId();

    await interaction[reply]({
      embeds: [embed],
      components: [
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder().setCustomId(confirmTrue).setEmoji("✅").setLabel("Confirm").setStyle(Discord.ButtonStyle.Success),
          new Discord.ButtonBuilder().setCustomId(confirmFalse).setEmoji("⛔").setLabel("Cancel").setStyle(Discord.ButtonStyle.Danger)
        )
      ],
      ephemeral: true,
      content: null
    });

    const confirm = await interaction.channel.awaitMessageComponent({
      filter: (button) => button.user.id === interaction.user.id && (button.customId === confirmTrue || button.customId === confirmFalse),
      componentType: ComponentType.Button,
      time: 60000
    }).catch(() => ({ customId: "confirmTimeout" }));

    if (confirm.customId === confirmTrue) return true;
    else if (confirm.customId === confirmFalse) return false;
    else return null;
  },
  awaitDM: async (msg, user, timeout = 60) => {
    const message = await user.send({ embeds: [
      utils.embed()
      .setTitle("Awaiting Response")
      .setDescription(msg)
      .setFooter({ text: `Times out in ${timeout} seconds.` })
      .setColor("Red")
    ] });

    const collected = await message.channel.awaitMessages({
      filter: (m) => !m.content.startsWith("!") && !m.content.startsWith("/"), max: 1,
      time: timeout * 1000
    });

    const response = utils.embed()
      .setTitle("Awaited Response")
      .setColor("Purple");

    if (collected.size === 0) {
      await message.edit({ embeds: [
        response
        .setDescription(msg)
        .setFooter({ text: "Timed out. Please see original message." })
      ] });
      return null;
    } else {
      await message.edit({ embeds: [
        response
        .setDescription(`Got your response! Please see original message.\n\`\`\`\n${collected.first()}\n\`\`\``)
        .addFields({ name: "Original Question", value: msg, inline: false })
      ] });
      return collected.first();
    }
  },
  db: db,
  /**
   * Create an embed from a message
   * @param {Discord.Message} msg The message to turn into an embed
   * @returns {Discord.EmbedBuilder}
   */
  msgReplicaEmbed: (msg, title = "Message", channel = false, files = true) => {
    const embed = utils.embed({ author: msg.member ?? msg.author })
      .setTitle(title)
      .setDescription(msg.content || null)
      .setTimestamp(msg.editedAt ?? msg.createdAt);
    if (msg.editedAt) embed.setFooter({ text: "[EDITED]" });
    if (channel) {
      embed.addFields(
        { name: "Channel", value: msg.channel.toString() },
        { name: "Jump to Post", value: `[Message](${msg.url})` }
      );
    }
    if (files && msg.attachments.size > 0) embed.setImage(msg.attachments.first().url);
    else if (msg.stickers.size > 0) embed.setImage(msg.stickers.first().url);
    return embed;
  },
  /**
   * Shortcut to nanoid. See docs there for reference.
   */
  customId: nanoid,
  /**
   * Shortcut to Discord.Util.escapeMarkdown. See docs there for reference.
   */
  escapeText: escapeMarkdown,
  attachment: (data) => new Discord.AttachmentBuilder(data),
  /**
   * Returns a MessageEmbed with basic values preset, such as color and timestamp.
   * @param {any} data The data object to pass to the MessageEmbed constructor.
   *   You can override the color and timestamp here as well.
   */
  embed: function(data = {}) {
    if (data?.author instanceof Discord.GuildMember) {
      data.author = {
        name: data.author.displayName,
        iconURL: data.author.user.displayAvatarURL()
      };
    } else if (data?.author instanceof Discord.User) {
      data.author = {
        name: data.author.username,
        iconURL: data.author.displayAvatarURL()
      };
    }
    const embed = new Discord.EmbedBuilder(data);
    if (!data?.color) embed.setColor(config.color);
    if (!data?.timestamp) embed.setTimestamp();
    return embed;
  },
  /**
   * Handles a command exception/error. Most likely called from a catch.
   * Reports the error and lets the user know.
   * @param {Error | null} [error] The error to report.
   * @param {any} message Any Discord.Message, Discord.BaseInteraction, or text string.
   */
  errorHandler: function(error, message = null) {
    if (!error || (error.name === "AbortError")) return;

    console.error(Date());

    const embed = utils.embed().setTitle(error?.name?.toString() ?? "Error");

    if (message instanceof Discord.Message) {
      const loc = (message.guild ? `${message.guild?.name} > ${message.channel?.name}` : "DM");
      console.error(`${message.author.username} in ${loc}: ${message.cleanContent}`);

      message.channel.send("I've run into an error. I've let my devs know.")
        .then(utils.clean);
      embed.addFields(
        { name: "User", value: message.author.username, inline: true },
        { name: "Location", value: loc, inline: true },
        { name: "Command", value: message.cleanContent || "`undefined`", inline: true }
      );
    } else if (message instanceof Discord.BaseInteraction) {
      const loc = (message.guild ? `${message.guild?.name} > ${message.channel?.name}` : "DM");
      console.error(`Interaction by ${message.user.username} in ${loc}`);
      if (message.isRepliable() && (message.deferred || message.replied)) message.editReply("I've run into an error. I've let my devs know.").catch(utils.noop).then(utils.clean);
      else if (message.isRepliable()) message.reply({ content: "I've run into an error. I've let my devs know.", ephemeral: true }).catch(utils.noop).then(utils.clean);
      embed.addFields(
        { name: "User", value: message.user?.username, inline: true },
        { name: "Location", value: loc, inline: true }
      );

      const descriptionLines = [message.commandId || message.customId || "`undefined`"];
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

    console.trace(error);

    let stack = (error.stack ? error.stack : error.toString());
    if (stack.length > 4096) stack = stack.slice(0, 4000);

    embed.setDescription(stack);
    return errorLog.send({ embeds: [embed] });
  },
  errorLog,
  /**
   * Fetch partial Discord objects
   * @param {*} obj The Discord object to fetch.
   */
  fetchPartial: (obj) => { return obj.fetch(); },
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
  /** Shortcut to utils/perms.js */
  perms: p,
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
   * @returns {"<t:time:format>"}
   */
  time: function(time, format = "f") {
    return Discord.time(time, format);
  },
  /**
   * Shortcut to snowflakes.json or snowflakes-testing.json depending on if devMode is turned on
   */
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
