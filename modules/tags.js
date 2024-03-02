// @ts-check

const Augur = require("augurbot-ts"),
  Discord = require('discord.js'),
  sf = require('../config/snowflakes.json'),
  perms = require('../utils/perms'),
  u = require("../utils/utils");

/**
 * @type {Discord.Collection<string, u.tag>}
 */
let tags = new u.Collection();

/**
 * @param {string | undefined} tag The tag name to find
 */
const findTag = (tag) => tag ? tags.find(t => t.tag.toLowerCase() == tag.toLowerCase()) ?? null : null;

/** @param {Discord.Message} msg */
function runTag(msg) {
  const cmd = u.parse(msg);
  const randomChannels = msg.guild ? msg.guild.channels.cache.filter(c => c.isTextBased() && !c.isThread() && !c.permissionOverwrites?.cache.get(msg.guild?.id ?? "")?.deny?.has("ViewChannel")).map(c => c.toString()) : ["Here"];
  const tag = findTag(cmd?.command);
  const files = [];
  let target = msg.mentions?.members?.first() || msg.mentions?.users?.first();
  if (tag) {
    let response = tag.response;
    if (response) {
      const regex = /<@random ?\[(.*?)\]>/gm;
      if (regex.test(response)) {
        const replace = (/** @type {string} */ str) => u.rand(str.replace(regex, '$1').split('|'));
        response = response.replace(regex, replace);
      }
      response = response.replace(/<@author>/ig, msg.author.toString())
        .replace(/<@authorname>/ig, msg.member?.displayName || msg.author.username)
        .replace(/<@channel>/ig, msg.channel.toString())
        .replace(/<@randomchannel>/, u.rand(randomChannels) ?? msg.channel.toString());
      if ((/(<@target>)|(<@targetname>)/ig).test(response)) {
        if (!msg.guild) target ??= msg.client.user;
        if (!target) return msg.reply("You need to `@mention` a user with that command!").then(u.clean);
        response = response.replace(/<@target>/ig, target.toString())
          .replace(/<@targetname>/ig, target.displayName);
      }
    }
    if (tag.attachment) {
      files.push(u.attachment.setFile(tag.attachment));
    }
    const users = target ? [target.id] : [];
    users.push(msg.author.id);
    msg.channel.send({ content: response ?? undefined, files, allowedMentions: { users } });
  }
}

const Module = new Augur.Module()
.addInteraction({
  name: "tag",
  id: sf.commands.slashTag,
  permissions: (int) => int.options.getSubcommand() == 'list' ? true : (perms.isMgr(int) || perms.isMgmt(int) || perms.isAdmin(int)),
  process: async (int) => {
    switch (int.options.getSubcommand()) {
    case "create": return await createTag();
    case "modify": return await modifyTag();
    case "delete": return await deleteTag();
    case "help": return await placeholders();
    case "value": return await rawTag();
    case "list": return await listTags();
    }
    async function createTag() {
      const name = int.options.getString('name', true).toLowerCase();
      const response = int.options.getString('response');
      const attachment = int.options.getAttachment('attachment');
      if (findTag(name)) return int.reply({ content: `"Looks like that tag already exists. Try </tag modify:${sf.commands.slashTag}> or </tag delete:${sf.commands.slashTag}> instead."`, ephemeral: true });
      if (!response && !attachment) return int.reply({ content: "I need either a response or a file.", ephemeral: true });
      const command = await u.db.tags.addTag({
        tag: name,
        response: response ?? undefined,
        attachment: attachment?.url ?? undefined
      });
      if (!command) return int.reply({ content: "I wasn't able to save that. Please try again later or with a different name." });
      tags.set(command.tag, command);
      const embed = u.embed({ author: int.member })
        .setTitle("Tag created")
        .setDescription(`${int.member} added the tag "${name}"`);
      try {
        if (command.response) embed.addFields({ name: "Response", value: command.response });
        if (command.attachment) embed.setImage(command.attachment);
        int.client.channels.cache.get(sf.channels.modlogs)?.send({ embeds: [embed] });
        int.reply({ embeds: [embed.setDescription('')], ephemeral: true });
      } catch (error) {
        int.client.channels.cache.get(sf.channels.modlogs)?.send({ embeds: [embed.addFields({ name: "Error", value: "The tag creation preview was too long to send." })] });
        int.reply({ content: `I saved the tag \`${name}\`, but I wasn't able to send you the preview`, ephemeral: true });
      }
    }
    async function modifyTag() {
      const name = int.options.getString('name', true).toLowerCase();
      const response = int.options.getString('response');
      const attachment = int.options.getAttachment('attachment');
      const currentTag = findTag(name);
      if (!currentTag) return int.reply({ content: `"Looks like that tag doesn't exist. Use </tag list:${sf.commands.slashTag}> for a list of tags."`, ephemeral: true });
      if (!response && !attachment) return int.reply({ content: `I need a response, a file, or both. If you want to delete the tag, use </tag delete:<${sf.commands.slashTag}>.`, ephemeral: true });
      const command = await u.db.tags.modifyTag({
        tag: name,
        response: response ?? undefined,
        attachment: attachment?.name ?? undefined
      });
      if (!command) return int.reply({ content: "I wasn't able to update that. Please try again later or contact a dev to see what went wrong.", ephemeral: true });
      tags.set(command.tag, command);
      const embed = u.embed({ author: int.member })
        .setTitle("Tag modified")
        .setDescription(`${int.member} modified the tag "${name}"`);
      try {
        if (command.response != currentTag.response) {
          embed.addFields(
            { name: "Old Response", value: currentTag.response ?? 'None' },
            { name: "New Response", value: command.response ?? 'None' }
          );
        }
        if (command.attachment != currentTag.attachment) {
          embed.addFields(
            { name: "Old File", value: `${currentTag.attachment ? `[Old](${command.attachment})` : 'None'}` },
            { name: "New File", value: `${command?.attachment ? `[New](${command.attachment})` : 'None'}` }
          );
        }
        int.client.channels.cache.get(sf.channels.modlogs)?.send({ embeds: [embed] });
        int.reply({ embeds: [embed.setDescription("")], ephemeral: true });
      } catch (error) {
        int.client.channels.cache.get(sf.channels.modlogs)?.send({ embeds: [u.embed({ author: int.member }).addFields({ name: "Error", value: "The tag change preview was too long to send" })] });
        int.reply({ content: `I saved the tag \`${name}\`, but I wasn't able to send you the preview`, ephemeral: true });
      }
    }
    async function deleteTag() {
      const name = int.options.getString('name', true).toLowerCase();
      if (!findTag(name)) return int.reply({ content: `"Looks like that tag doesn't exist. Use </tag list:${sf.commands.slashTag}> for a list of tags."`, ephemeral: true });
      const command = await u.db.tags.deleteTag(name);
      if (!command) return int.reply({ content: "I wasn't able to delete that. Please try again later or contact a dev to see what went wrong.", ephemeral: true });
      try {
        const embed = u.embed({ author: int.member })
          .setTitle("Tag Deleted")
          .setDescription(`${int.member} removed the tag "${name}"`);
        if (command.response) embed.addFields({ name: "Response", value: command.response });
        if (command.attachment) embed.setImage(command.attachment);
        int.client.channels.cache.get(sf.channels.modlogs)?.send({ embeds: [embed] });
        int.reply({ embeds: [embed.setDescription("")], ephemeral: true });
      } catch (err) {
        int.client.channels.cache.get(sf.channels.modlogs)?.send({ embeds: [u.embed({ author: int.member }).addFields({ name: "Error", value: "The tag deletion preview was too long to send" })] });
        int.reply({ content: `I deleted the tag \`${name}\`, but I wasn't able to send you the preview`, ephemeral: true });
      }
      tags.delete(name);
    }
    async function placeholders() {
      const placeholderDescriptions = [
        "`<@author>`: Pings the user",
        "`<@authorname>`: The user's nickname",
        "`<@target>`: Pings someone who is pinged by the user",
        "`<@targetname>`: The nickname of someone who is pinged by the user",
        "`<@channel>`: The channel the command is used in",
        "`<@randomchannel> A random public channel`",
        "`<@random [item1|item2|item3...]>`: Randomly selects one of the items. Separate with `|`. (No, there can't be `<@random>`s inside of `<@random>`s)",
        "",
        "Example: <@target> took over <@channel>, but <@author> <@random is complicit|might have something to say about it>."
      ];
      const embed = u.embed().setTitle("Tag Placeholders").setDescription(`You can use these when creating or modifying tags for some user customization. The \`<@thing>\` gets replaced with the proper value when the command is run. \n\n${placeholderDescriptions.join('\n')}`);
      return int.reply({ embeds: [embed], ephemeral: true });
    }
    async function rawTag() {
      const name = int.options.getString('name', true).toLowerCase();
      const tag = findTag(name);
      if (!tag) return int.reply({ content: `"Looks like that tag doesn't exist. Use </tag list:${sf.commands.slashTag}> for a list of tags."`, ephemeral: true });
      const embed = u.embed({ author: int.member })
        .setTitle(tag.tag)
        .setDescription(tag.response ?? null)
        .setImage(tag.attachment ?? null);
      return int.reply({ embeds: [embed], ephemeral: true });
    }
    async function listTags() {
      const list = Array.from(tags.values()).map(c => u.config.prefix + c.tag).sort();
      // get a multi embed thing going like!help does
      const embed = u.embed()
        .setTitle("Custom tags in LDSG")
        .setThumbnail(int.client.guilds.cache.get(u.sf.ldsg)?.iconURL() ?? null)
        .setDescription(list.join("\n"));
      int.reply({ embeds: [embed], ephemeral: true });
    }
  }
})
.addEvent("messageCreate", async (msg) => { if (!msg.author.bot) return runTag(msg); })
.addEvent("messageUpdate", async (oldMsg, msg) => {
  if (msg.partial) msg = await msg.fetch();
  if (!msg.author?.bot) return runTag(msg);
})
.setInit(async () => {
  try {
    const cmds = await u.db.tags.fetchAllTags();
    tags = new u.Collection(cmds.map(c => [c.tag, c]));
  } catch (error) { u.errorHandler(error, "Load Custom Tags"); }
})
.addEvent('interactionCreate', async interaction => {
  if (interaction.isAutocomplete() && interaction.commandId == sf.commands.slashTag) {
    const focusedValue = interaction.options.getFocused()?.toLowerCase();
    const filtered = tags.filter(tag => tag.tag.toLowerCase().startsWith(focusedValue));
    await interaction.respond(filtered.map(choice => ({ name: choice.tag, value: choice.tag })));
  }
});

module.exports = Module;