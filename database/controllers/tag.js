// @ts-check
const Tag = require("../models/Tag.model");

/**
 * @typedef tag
 * @property {string} tag the tag name
 * @property {string} [response] the tag response
 * @property {string} [attachment] the tag file name
 */

module.exports = {
  /**
   * Fetch all tags
   * @returns {Promise<tag[]>}
   */
  fetchAllTags: async function() {
    return Tag.find({}).exec();
  },
  /**
   * Add a tag to the database
   * @param {tag} data tag data
   * @returns {Promise<tag | null>}
   */
  addTag: async function(data) {
    if (await Tag.exists({ tag: data.tag })) return null;
    return new Tag(data).save();
  },
  /**
   * Modify a tag
   * @param {tag} data tag data
   * @returns {Promise<tag | null>}
   */
  modifyTag: async function(data) {
    if (!await Tag.exists({ tag: data.tag })) return null;
    return Tag.findOneAndUpdate({ tag: data.tag }, data, { new: true }).exec();
  },
  /**
   * Delete a tag
   * @param {string} tag the tag to delete
   * @returns {Promise<tag | null>}
   */
  deleteTag: async function(tag) {
    if (!await Tag.exists({ tag })) return null;
    return await Tag.findOneAndDelete({ tag }).exec();
  }
};