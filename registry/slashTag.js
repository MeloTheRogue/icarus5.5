const Discord = require('discord.js');
const type = Discord.ApplicationCommandOptionType;
const cmdType = Discord.ApplicationCommandType;

module.exports = {
  "name": "tag",
  "description": "Create, Modify, or Delete a tag",
  "type": cmdType.ChatInput,
  "options": [
    {
      "type": type.Subcommand,
      "name": "list",
      "description": "Get a list of tags"
    },
    {
      "type": type.Subcommand,
      "name": "create",
      "description": "[MGR] Create a tag.",
      "options": [
        {
          "type": type.String,
          "name": "name",
          "description": "The name of the new tag (must not include any spaces).",
          "required": true
        },
        {
          "type": type.String,
          "name": "response",
          "description": "Text to respond with."
        },
        {
          "type": type.Attachment,
          "name": "attachment",
          "description": "File to respond with."
        }
      ]
    },
    {
      "type": type.Subcommand,
      "name": "modify",
      "description": "[MGR] Modify a tag.",
      "options": [
        {
          "type": type.String,
          "name": "name",
          "description": "The name of the tag to modify.",
          "required": true,
          "autocomplete": true
        },
        {
          "type": type.String,
          "name": "response",
          "description": "Text to respond with."
        },
        {
          "type": type.Attachment,
          "name": "attachment",
          "description": "File to respond with."
        }
      ]
    },
    {
      "type": type.Subcommand,
      "name": "delete",
      "description": "[MGR] Delete a tag.",
      "options": [
        {
          "type": type.String,
          "name": "name",
          "description": "The name of the tag to delete.",
          "required": true,
          "autocomplete": true
        }
      ]
    },
    {
      "type": type.Subcommand,
      "name": "help",
      "description": "[MGR] Get a list of placeholders you can use in tags."
    },
    {
      "type": type.Subcommand,
      "name": "value",
      "description": "[MGR] Get the raw response of a tag. Useful for modifying.",
      "options": [
        {
          "type": type.String,
          "name": "name",
          "description": "The name of the tag to view.",
          "required": true,
          "autocomplete": true
        }
      ]
    }
  ]
};