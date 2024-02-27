// @ts-check

const { GoogleSpreadsheet } = require("google-spreadsheet");
const config = require("../config/config.json");
// const u = require("../utils/utils");
const Augur = require("augurbot-ts");
const fs = require("fs");
const schedule = require("node-schedule");
let doc;
const Module = new Augur.Module()
.setInit(async () => {
  doc = new GoogleSpreadsheet(config.google.sheets.stats); // make sure to set value in config
  await doc.useServiceAccountAuth(config.google.creds);
  await doc.loadInfo();
  const rule = new schedule.RecurrenceRule();
  rule.hour = 23;
  rule.minute = 50;
  schedule.scheduleJob(rule, looper); // obviously wrong but I don't have the docs rn. Look at cakeday for correct implementation
});

async function looper() {
  // load all sheets from document
  const data = doc.sheetsByTitle["cmds"];
  const tagData = doc.sheetsByTitle["tags"];
  const intData = doc.sheetsByTitle["ints"];
  const evtData = doc.sheetsByTitle["evts"];
  // calculate command usage
  const counts = calcUsage();
  // add data to the spreadsheet
  await data.addRow(counts.cmds);
  await tagData.addRow(counts.tags);
  await intData.addRow(counts.ints);
  await evtData.addRow(counts.evts);
}

function calcUsage() {
  const today = new Date().toDateString();
  const restart = require('../data/stats.json');
  // Command[] -> [commandName, count][] -> { commandName: count, … }
  // so it'll look like { ban: 99, roll: 3, … }
  const cDat = Module.client.commandUsage;
  const iDat = Module.client.interactionUsage;
  const tDat = Module.client.tagUsage;
  const eDat = Module.client.eventUsage;
  // adds counts if bot is restarted during the day
  if (restart.date = today) {
    for (const c in restart.cmds) cDat[c] = (cDat[c] || 0) + restart.cmds[c];
    for (const i in restart.ints) iDat[i] = (iDat[i] || 0) + restart.ints[i];
    for (const t in restart.tags) tDat[t] = (tDat[t] || 0) + restart.tags[t];
    for (const e in restart.evts) eDat[e] = (eDat[e] || 0) + restart.evts[e];
  }
  // set the date property
  cDat.date = today;
  iDat.date = today;
  tDat.date = today;
  eDat.date = today;

  // reset usage
  Module.client.commandUsage = {};
  Module.client.interactionUsage = {};
  Module.client.tagUsage = {};
  Module.client.eventUsage = {};
  fs.writeFileSync('../data/stats.json', `{"date": "", "cmds": {}, "ints": {}, "tags": {}, "evts": {}}`);
  return { cmds: cDat, ints: iDat, tags: tDat, evts: eDat };
}
