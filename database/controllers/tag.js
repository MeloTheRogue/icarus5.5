// @ts-check
const mongoose = require('mongoose')
const Tag = require("../models/Tag.model");

/**
 * @typedef {mongoose.Document<unknown, {}, { tag: string; response?: string | undefined; attachment?: string | undefined; }> & { tag: string; response?: string | undefined; attachment?: string | undefined;}} docTag
 */

/**
 * @typedef tag
 * @property {string} tag the tag name
 * @property {string | undefined?} response the tag response
 * @property {string | undefined?} attachment the tag file name
 */

module.exports = {
  /**
   * Fetch all tags
   */
  fetchAllTags: async function() {
    return Tag.find({}).exec();
  },
  /**
   * Fetch all tags in a guild
   */
  fetchAllGuildTags: async function() {
    return await Tag.find();
  },
  /**
   * Add a tag to the database
   * @param {tag} data tag data
   */
  addTag: async function(data) {
    if (await Tag.exists({ tag: data.tag })) return null;
    return new Tag(data).save();
  },
  /**
   * Modify a tag
   * @param {tag} data tag data
   */
  modifyTag: async function(data) {
    if (!await Tag.exists({ tag: data.tag })) return null;
    return Tag.findOneAndUpdate({ tag: data.tag }, data, { new: true }).exec();
  },
  /**
   * Delete a tag
   * @param {string} tag the tag to delete
   */
  deleteTag: async function(tag) {
    if (!await Tag.exists({ tag })) return null;
    return await Tag.findOneAndDelete({ tag }).exec();
  }
};