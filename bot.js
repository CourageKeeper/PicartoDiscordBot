/*
* This is a Discord bot that can be added to servers and configured to announce
* when streams on the Picarto.tv service go live.
*/
//Required frameworks
const Discord = require("discord.js"); //Required by Discord
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest; //Required to check AP
const fs = require("fs");//Required to write to disk
const Datastore = require('nedb');//Required for the database

//Global variable and object setup
const bot = new Discord.Client();
const botConfig = require("./config/botConfig.json");
const botPrefix = botConfig.prefix;
const refreshRate = botConfig.refreshRate;
const dayInMilliSec = 86400000;
const endNotificationDelay = botConfig.endNotificationDelay;
const replyTimeLimit = botConfig.replyTimeLimit;
var collector = null;
const APILink = "https://api.picarto.tv/v1/channel/name/";
const streamLink = "https://picarto.tv/";

db = new Datastore({ filename: "./database/streamerStates.db", autoload: true });
//TODO setup bot channel when bot is first joined to server

bot.login(botConfig.token);

bot.on('unhandledRejection', console.error);

bot.on("ready", () => {
  var serverIDArray = bot.guilds.keyArray();

  for (i = 0; i < serverIDArray.length; i++){
    var currentID = serverIDArray[i];
    var botChannelDefault = bot.guilds.get(currentID).defaultChannel.id;
    db.findOne({_id : currentID}, function checkForDocument (err, newDoc){
      if(err){
        console.log("Error finding document: " + err);
      }
      else if (newDoc === null) {//create document
        var doc = { _id : currentID,
                    botChannelID : botChannelDefault,
                    streamers : []
                  };
        db.insert(doc);
        console.log("Document for ID: " + currentID + " created.");
      }
      else {
        console.log("Document for ID: " + currentID + " exists.");
      }
    });//End of db.findOne
  }//End of for loop
  console.log("Ready!");
});//End of bot.on(Ready)

bot.on("message", message => {
  if (message.author.bot) return; //"We don't serve bots 'round here"

  try {
    var commandList = ["getserverid", "getchannelid", "commands"];
    if (message.channel.type === "dm") {
      handleDM(message, commandList); return; //Takes care of DMs
    }
    if (!message.content.startsWith(botPrefix)) return; //Only look for prefix messages
    if (!message.channel.permissionsFor(bot.user).hasPermissions([0x00000800])) return;//Return if we're not allowed to post to that channel

    let command = message.content.split(" ")[0];
    command = command.slice(botPrefix.length).toLowerCase();
    let args = message.content.split(" ").slice(1);

    if (command == commandList[0]) {//GetServerID
      message.reply("The ID for this server is: " + message.channel.guild.id); return;
    } else

    if (command == commandList[1]) {
      message.reply("The ID for this channel is: " + message.channel.id); return;
    } else

    if (command === commandList[2]) {//Commands
      var codeCommands = [];
      commandList.forEach(function (item, index) {
        codeCommands.push(" `" + botPrefix + item + "`");
      });
      message.reply("Here's a list of commands currently available: " + codeCommands);
    }
  }
  catch (err) {
    //console.log("Unable to respond to message: " + message.toString() + " for: " + message.author.username);
    //if (message.channel.type != "dm") console.log("On channel: " + message.channel.name);
  }
});//End of bot.on(Message)

setInterval(() => {
  var serverIDArray = bot.guilds.keyArray();

  for(i = 0; i < serverIDArray.length; i++){
    var currentID = serverIDArray[i];
    db.findOne({_id : currentID}, function checkForDocument (err, foundDoc){
      if(err){
        console.log("Error finding document: " + err);
      }
      else {
        var arrayOfStreamers = foundDoc.streamers.slice();
        var botChannelID = foundDoc.botChannelID.toString();

        for(o = 0; o < arrayOfStreamers.length; o++){

          let onlineStatus = checkIfStreamIsOnline(arrayOfStreamers[o].name);
          let cloned = Object.assign({}, arrayOfStreamers[o]);

          if (onlineStatus == true) {

            streamOnline(currentID, botChannelID, cloned);

          } else
          if (onlineStatus == false) {

            streamOffline(currentID, botChannelID, cloned);

          } else
          if (onlineStatus == null){
            console.log("Online status for " + arrayOfStreamers[o].name + " came back as null.");
          }
        }//End of o loop
      }
    });//End of db.findOne
  }//End of i loop
}, refreshRate);

setInterval(() => {//DB compact and file cleanup.
  dbMaintAndFileCleanup();
}, dayInMilliSec/2);//Run cleanup every 12 hours

//Functions for db
function handleDM(message, chatCommandList){
  let command = message.content.split(" ")[0].toLowerCase();
  let args = message.content.split(" ").slice(1);

  var commandList = ["help", "hi", "commands", "addstreamer", "removestreamer",
                     "setbotchannel", "quickadd", "quickremove", "getserverid",
                     "getchannelid", "configure", "configurestreamer", "liststreamers"];


  if (command === commandList[0] || command === commandList[1]) {
    message.reply("Hello! Reply with: " +
                  "`addStreamer` " +
                  "to get started adding a streamer, or: " +
                  "`removeStreamer` " +
                  "to remove one.\n" +
                  "You will need your Discord Server ID for these, help with that can be seen with: `getServerID`\n" +
                  "If you would like to change the channel that the bot sends messages to, use: " +
                  "`setBotChannel` (you will need a channel ID, help with that can be seen with `getChannelID`)\n" +
                  "The `configureStreamer` command will allow you to add custom announcement messages when a stream " +
                  "comes online and when it goes offline.\n" +
                  "To see a list of all commands, type `commands`!");
  } else

  if (command === commandList[2] || command === commandList[2] + "!") {//Commands
    var codeCommands = [];
    commandList.forEach(function (item, index) {
      codeCommands.push(" `" + item + "`");
    });
    message.reply("Here's a list of commands currently available:" + codeCommands + "\nCommands do not require " +
                  "capitalization, but they should not contain spaces.");
  } else

  if (command === commandList[3]) {//addstreamer
    getStreamerName(message, "add");
  } else

  if (command === commandList[4]){//removestreamer
    getStreamerName(message, "remove");
  } else

  if (command === commandList[5]) {//setbotchannel
    getServerID(message, null, "setbotchannel");
  } else

  if (command === commandList[6]) {//quickAdd
    if(args.length != 2) {
      message.reply("Format for quickadd is: `quickadd`  `Username`  `ServerID`")
    } else {
      quickAdd(message, args[0], args[1]);//args[0] is Username, args[1] is the serverID
    }
  } else

  if (command === commandList[7]) {//quickRemove
    if(args.length != 2) {
      message.reply("Format for quickremove is: `quickadd`  `Username`  `ServerID`")
    } else {
      quickRemove(message, args[0], args[1]);//args[0] is Username, args[1] is the serverID
    }
  } else

  if (command === commandList[8]){//server ID
    let cmd = "`" + botPrefix + chatCommandList[0] + "`";
    message.reply("You can get your Discord Server ID by enabling \"Developer Mode\" under your Appearnce" +
                  " options in Discord then right-clicking on the server. Or, you can type " +
                  cmd + " into a channel on the server" +
                  " (please ensure the bot can send messages to that channel!).");
  } else

  if (command === commandList[9]){//channel ID
    let cmd = "`" + botPrefix + chatCommandList[1] + "`";
    message.reply("You can get channel ID by enabling \"Developer Mode\" under your Appearnce" +
                  " options in Discord then right-clicking on the channel name. Or, you can type " +
                  cmd + " into that channel." +
                  " (please ensure the bot can send messages to that channel!).");
  } else

  if (command == commandList[10] || command == commandList[11]) {//configure & configureStreamer
    getStreamerName(message, "config");
  } else

  if (command == commandList[12]){//List all streamers on a given server
    getServerID(message, null, "list");
  } else

  if (collector === null || collector.ended){//don't respond if the collector is running
    message.reply("Type `help` to see basic usage or `commands` to see a full list.");
  }

}//End of HandleDM

function getStreamerName(message, action){
  message.reply("Please enter the Picarto username of the streamer.");
  try {
    collector = message.channel.createCollector(
      message => !message.author.bot,
      { time: replyTimeLimit, max: 1 }
    );

    collector.on('end', (collected, reason) => {
      if (reason === "time") {
        message.reply("The time limit to reply has expired.");
      } else
      if (reason === "limit" && action === "add") {
        if(checkIfStreamExists(collected.first().toString())) {
          getServerID(message, collected.first().toString(), action);
        }
        else {
          message.reply("That streamer cannot be found on Picarto.tv\nPlease use the Channel Name from Picarto.tv");
        }
      } else
      if (reason === "limit") {
        getServerID(message, collected.first().toString(), action);
      }
      //message.reply("Adding: " + collected.first());
      //message.reply("Reason ended: " + reason);
    });
  }
  catch (err) {
    console.log("Error in getStreamerName: " + message.toString() + "\n" + err);
  }
}//End of getStreamerName

function getServerID(message, streamer, action){
  message.reply("Please enter your Discord ServerID.");
  try {
    collector = message.channel.createCollector(
      message => !message.author.bot,
      { time: replyTimeLimit, max: 1 }
    );
    collector.on('end', (collected, reason) => {
      if (reason === "time") {
        message.reply("The time limit to reply has expired.");
      } else
      if (reason === "limit") {
        verifyServer(message, streamer, collected.first().toString(), action);
      }
    });
  }
  catch (err) {
    console.log("Error in getServerID for message: " + message.toString() + "\n" + err);
  }
}//End of getServerID

function verifyServer(message, streamer, serverID, action){
  let serverIDArray = bot.guilds.keyArray();
  if (!serverIDArray.includes(serverID)){
    message.reply("The Picarto We're Live! bot is not a member of a server with the ID: " + serverID);
  } else {
    var server = bot.guilds.get(serverID);
    //message.reply("Server name: " + server.name);
    var perms = findPermissions(message, serverID);

    if (perms.admin || perms.guild || perms.channels || perms.messages){
      message.reply("Hello " + bot.guilds.get(serverID).members.get(message.author.id).nickname + "!");
      if (action === "add") addStreamerToDB (message, streamer, serverID); else
      if (action === "remove") removeStreamerFromDB (message, streamer, serverID); else
      if (action === "setbotchannel") getBotChannel(message, serverID); else
      if (action === "config") getConfigType(message, streamer, serverID, 0); else
      if (action === "list") listStreamers(message, serverID);
    } else {
      message.reply("Only users with management permissions can configure this service.");
    }
  }
}//End of verifyServer

function addStreamerToDB (message, streamer, serverID){
  //Find a document with both the serverID and a streamer with the name streamer
  db.findOne({ $and : [{_id : serverID}, {"streamers.name" : streamer}]}, function checkAndAdd (err, foundDoc){
    if(err){
      console.log("Error finding document: " + err);
    }
    else if (foundDoc === null) {//update document
      db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                         onlineState : null,
                                                         lastOnline : null,
                                                         intro : null,
                                                         outro : null}}}, {}, function (err, numreplaced) {
        message.reply(streamer + " has been added to " + bot.guilds.get(serverID).name);
      });//End of db.update
    }
    else {
      message.reply(streamer + " has already been added to " + bot.guilds.get(serverID).name);
    }
  });//End of db.findOne
}//End of addStreamerToDB

function removeStreamerFromDB (message, streamer, serverID){
  //Find a document with both the serverID and a streamer with the name streamer
  db.findOne({ $and : [{_id : serverID}, {"streamers.name" : streamer}]}, function checkAndRemove (err, foundDoc){
    if(err){
      console.log("Error finding document: " + err);
    }
    else if (foundDoc === null) {//update document
      message.reply(streamer + " is not currently added for the server " + bot.guilds.get(serverID).name);
    }
    else {
      db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
        message.reply(streamer + " has been removed from " + bot.guilds.get(serverID).name);
      });//End of db.update
    }
  });//End of db.findOne
}//End of removeStreamerFromDB

function checkIfStreamExists (streamer) {
  var request = new XMLHttpRequest();
  try {
    request.open("GET", APILink + streamer, false);
    request.send();
    if (request.status == 404) {
      return false;
    } else
    if (request.status == 200){
      return true;
    } else
    if (request.status >= 200 && request.status < 300){
      return true;
    }
    else {
      console.log("Odd request code when checking to see if a streamer exists: " + request.status);
      return false;
    }
  }
  catch (err) {
    console.log("An error has occured getting the API link:\n" + err);
  }
}//End of checkIfStreamExists

function getBotChannel (message, serverID) {
  message.reply("Please enter the channel ID of the channel you wish the bot to use.");
  try {
    collector = message.channel.createCollector(
      message => !message.author.bot,
      { time: replyTimeLimit, max: 1 }
    );
    collector.on('end', (collected, reason) => {
      if (reason === "time") {
        message.reply("The time limit to reply has expired.");
      } else
      if (reason === "limit") {
        let botChanID = collected.first().toString();
        if (!bot.guilds.get(serverID).channels.has(botChanID)){
          message.reply("There is not a channel with the ID " + botChanID + " on the server " + bot.guilds.get(serverID).name);
        } else {
          setBotChannel(message, serverID, botChanID);
        }
      }
    });
  }
  catch (err) {
    console.log("Error in getBotChannel for message: " + message.toString() + "\n" + err);
  }
}//End of getBotChannel

function setBotChannel (message, serverID, botChanID) {
  db.findOne({_id : serverID}, function checkAndSetBot (err, foundDoc){
    if(err){
      console.log("Error finding document: " + err);
    }
    else if (foundDoc === null) {//This is bad
      message.reply("We could not find the server config, please contact the bot admin.");
    }
    else {
      db.update({_id : serverID}, {$set : {botChannelID : botChanID}}, {}, function (err, numreplaced) {
        message.reply(bot.guilds.get(serverID).channels.get(botChanID).name + " is now the channel the " +
          "Picarto We're Live! bot will send notifications to " + bot.guilds.get(serverID).name);
      });//End of db.update
    }
  });//End of db.findOne
}//End of setBotChannel

function quickAdd (message, streamer, serverID) {
  if(checkIfStreamExists(streamer)){
    verifyServer(message, streamer, serverID, "add");
  } else {
    message.reply("That streamer cannot be found on Picarto.tv\nPlease use the Channel Name from Picarto.tv");
  }
}//End of quickAdd

function quickRemove (message, streamer, serverID){
  if(checkIfStreamExists(streamer)){
    verifyServer(message, streamer, serverID, "remove");
  } else {
    message.reply("That streamer cannot be found on Picarto.tv\nPlease use the Channel Name from Picarto.tv");
  }
}

function checkIfStreamIsOnline (streamerName) {
  var request = new XMLHttpRequest();
  try {
    request.open("GET", APILink + streamerName, false);
    request.send();
    if (request.status == 200){
      var reply = JSON.parse(request.responseText);
      return reply.online;
    }
    else {
      console.log(request.status);
      return null;
    }
  }
  catch (err) {
    console.log("An error has occured getting the API link:");
    console.log(err);
  }
}//End of checkIfStreamIsOnline

function streamOnline (serverID, botChanID, streamerObject) {
  let streamer = streamerObject.name;
  let currentState = streamerObject.onlineState;
  let introString = streamerObject.intro;
  let outroString = streamerObject.outro;

  if (currentState === true) {//Update lastOnline
    var date = Date.now();
    db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
      db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                         onlineState : true,
                                                         lastOnline : date,
                                                         intro : introString,
                                                         outro : outroString}}}, {}, function (err, numreplaced) {
      });//End of db.update
    });//End of db.update
  } else
  if (currentState === false) {//Announce that we have gone live!
    var date = Date.now();
    db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
      db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                         onlineState : true,
                                                         lastOnline : date,
                                                         intro : introString,
                                                         outro : outroString}}}, {}, function (err, numreplaced) {
      try {

        if (introString == null) {
          bot.guilds.get(serverID).channels.get(botChanID).sendMessage("@here " + streamer +
                                    " is streaming! Join us here: " + streamLink + streamer).then(function () {
                                         //console.log("Promise Resolved");
                                    }).catch(function () {
                                      console.log("Unable to send default online message to the channel: " +
                                                  bot.guilds.get(serverID).channels.get(botChanID).name + " for: " + bot.guilds.get(serverID).name);
                                    });
        } else {
          bot.guilds.get(serverID).channels.get(botChanID).sendMessage("@here " + introString +
                                    " Join here: " + streamLink + streamer).then(function () {
                                         //console.log("Promise Resolved");
                                    }).catch(function () {
                                      console.log("Unable to send a message to the channel: " +
                                                  bot.guilds.get(serverID).channels.get(botChanID).name + " for: " + bot.guilds.get(serverID).name);
                                    });
        }
      }
      catch (err) {
        //console.log("Unable to send a message to the channel: " +
                    //bot.guilds.get(serverID).channels.get(botChanID).name + " for: " + bot.guilds.get(serverID).name);
      }

      });//End of db.update
    });//End of db.update
  } else
  if (currentState === null) {// No notification because it's coming from a null state. This implies the streamer was added while live
    var date = Date.now();
    db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
      db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                         onlineState : true,
                                                         lastOnline : date,
                                                         intro : introString,
                                                         outro : outroString}}}, {}, function (err, numreplaced) {
      });//End of db.update
    });//End of db.update
  }
}//end of streamOnline

function streamOffline  (serverID, botChanID, streamerObject) {
  let streamer = streamerObject.name;
  let currentState = streamerObject.onlineState;
  let lastOnline = streamerObject.lastOnline;
  let introString = streamerObject.intro;
  let outroString = streamerObject.outro;

  if (currentState === true) {//Going offline, notify after endNotificationDelay amount of time!
    db.findOne({_id : serverID}, function (err, foundDoc){
      var arrayOfStreamers = foundDoc.streamers.slice();
      var currentTime = Date.now();

      if (currentTime - lastOnline < endNotificationDelay) {
        //Do nothing, still waiting
      } else
      if (currentTime - lastOnline >= endNotificationDelay) {//We have been offline for a minute
        db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
          db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                             onlineState : false,
                                                             lastOnline : lastOnline,
                                                             intro : introString,
                                                             outro : outroString}}}, {}, function (err, numreplaced) {
            try {
              if (outroString == null) {
                bot.guilds.get(serverID).channels.get(botChanID).sendMessage(streamer + " has gone offline, thanks for watching!").then(function () {
                     //console.log("Promise Resolved");
                }).catch(function () {
                  console.log("Unable to send default offline message to the channel: " +
                              bot.guilds.get(serverID).channels.get(botChanID).name + " for: " + bot.guilds.get(serverID).name);
                });
              } else {
                bot.guilds.get(serverID).channels.get(botChanID).sendMessage(streamer + " has gone offline. " + outroString).then(function () {
                     //console.log("Promise Resolved");
                }).catch(function () {
                  console.log("Unable to send a message to the channel: " +
                              bot.guilds.get(serverID).channels.get(botChanID).name + " for: " + bot.guilds.get(serverID).name);
                });
              }
            }
            catch (err) {
              //console.log("Unable to send a message to the channel: " +
                          //bot.guilds.get(serverID).channels.get(botChanID).name + " for: " + bot.guilds.get(serverID).name);
            }
          });//End of db.update
        });//End of db.update
      }

    });
  } else

  if (currentState === false) {//Still offline, do nothing

  } else
  if (currentState === null) {//New user, setup
    db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
      db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                         onlineState : false,
                                                         lastOnline : null,
                                                         intro : introString,
                                                         outro : outroString}}}, {}, function (err, numreplaced) {
      });//End of db.update
    });//End of db.update
  }
}//End of streamOffline

function dbMaintAndFileCleanup() {
  db.persistence.compactDatafile();
  try {
    fs.readdir("./", function (err, files){
      files.forEach(function (item, index) {
        if(item.startsWith(".node-xmlhttprequest-sync")){
          if(Date.now() - fs.lstatSync("./"+item).birthtime > 300000){
            fs.unlink("./"+item, (err) => {
              if(err) console.log(err);
            });
          }
        }
      });
    });
  }//End of try
  catch (error) {
    console.log("Should not be an issue\n" + error);
  }
}//dbMaintAndFileCleanup

function findPermissions (message, serverID) {//Returns an object containing the four types of permissions the user has
  var permissions = bot.guilds.get(serverID).members.get(message.author.id).permissions;

  return {
    "admin"     : permissions.hasPermission(0x00000008),//Administrator
    "guild"     : permissions.hasPermission(0x00000020),//Manage Guild permission
    "channels"  : permissions.hasPermission(0x00000010),//Manage Channels
    "messages"  : permissions.hasPermission(0x00002000) //Manage messages
  }
}//End of findPermissions

function getConfigType (message, streamer, serverID, attempt) {
  message.reply("Please enter `intro` to add a custom announcement message, `outro` to add a custom" +
                " goodbye message, or `both` to setup both. The command `reset` will set both back to the" +
                " default message.");
  try {
    collector = message.channel.createCollector(
      message => !message.author.bot,
      { time: replyTimeLimit*2, max: 1 }
    );
    collector.on('end', (collected, reason) => {
      if (reason === "time") {
        message.reply("The time limit to reply has expired.");
      } else
      if (reason === "limit") {
        var options = ["intro", "outro", "both", "reset"];
        if (options.includes(collected.first().toString().toLowerCase())) {
          getConfigSettings(message, streamer, serverID, collected.first().toString().toLowerCase());
        } else
        if (attempt > 0){
          message.reply("The only valid options are `into`, `outro`, `both`, and `reset`, returning to start.")
        } else {
          message.reply("The only valid options are `into`, `outro`, `both` and `reset`");
          getConfigType(message, streamer, serverID, 1);
        }

      }
    });
  }
  catch (err) {
    console.log("Error in get configType of message: " + message.toString() + "\n" + err);
  }
}//End of getConfigType


function getConfigSettings (message, streamer, serverID, configType) {
  if (configType === "intro") {
    message.reply("Please enter your custom stream announcement: ");
    collectResponse(message, 4, function (response) {
      if (response == null) message.reply("The time limit to reply has expired."); else
      processAnnouncements(message, streamer, serverID, response.array().toString(), "intro");
    });
  } else

  if (configType === "outro") {
    message.reply("Please enter your custom stream ending announcement: ");
    collectResponse(message, 4, function (response) {
      if (response == null) message.reply("The time limit to reply has expired."); else
      processAnnouncements(message, streamer, serverID, response.array().toString(), "outro");
    });
  } else

  if (configType === "both") {
    message.reply("Please enter your custom stream announcement: ");
    collectResponse(message, 4, function (response) {
      if (response == null) message.reply("The time limit to reply has expired."); else
      processAnnouncements(message, streamer, serverID, response.array().toString(), "intro", function () {
        message.reply("Please enter your custom stream ending announcement: ");
      });

      collectResponse(message, 4, function (response) {
        if (response == null) message.reply("The time limit to reply has expired."); else
        processAnnouncements(message, streamer, serverID, response.array().toString(), "outro");
      });
    });
  } else

  if (configType === "reset") {
    processAnnouncements(message, streamer, serverID, null, "reset");
  }
}//End of getConfigSettings

function processAnnouncements (message, streamer, serverID, configMessage, type, callback) {
  db.findOne({_id : serverID}, function checkForDocument (err, foundDoc){
    if(err){
      console.log("Error finding document: " + err);
    }
    else {
      var arrayOfStreamers = foundDoc.streamers.slice();
      for(o = 0; o < arrayOfStreamers.length; o++){//Loops through to find the streamer who's name matches ours
        if (arrayOfStreamers[o].name === streamer) {
          let cloned = Object.assign({}, arrayOfStreamers[o]);
          if(type === "intro") setIntro(message, serverID, cloned, configMessage, callback); else
          if(type === "outro") setOutro(message, serverID, cloned, configMessage); else
          if(type === "reset") resetIntroOutro(message, serverID, cloned);
        }
      }//End of o loop
    }
  });//End of db.findOne
}//End of processAnnouncements

function setIntro (message, serverID, streamerObject, introMessage, callback) {
  let streamer = streamerObject.name;
  let currentState = streamerObject.onlineState;
  let date = streamerObject.lastOnline;
  let introString = introMessage;
  let outroString = streamerObject.outro;

  db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
    db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                       onlineState : currentState,
                                                       lastOnline : date,
                                                       intro : introString,
                                                       outro : outroString}}}, {}, function (err, numreplaced) {
      message.reply("Stream announcement for " + streamer + " has been set to: " + introMessage);
      if(callback != undefined) callback();//Callback is only called when both Intro and Outro are being set at the same time.
    });//End of db.update
  });//End of db.update
}//End of setIntro

function setOutro (message, serverID, streamerObject, outroMessage) {
  let streamer = streamerObject.name;
  let currentState = streamerObject.onlineState;
  let date = streamerObject.lastOnline;
  let introString = streamerObject.intro;
  let outroString = outroMessage;

  db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
    db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                       onlineState : currentState,
                                                       lastOnline : date,
                                                       intro : introString,
                                                       outro : outroString}}}, {}, function (err, numreplaced) {

      message.reply("Stream ending announcement for " + streamer + " has been set to: " + outroMessage);
    });//End of db.update
  });//End of db.update
}//End of setOutro

function resetIntroOutro (message, serverID, streamerObject) {
  let streamer = streamerObject.name;
  let currentState = streamerObject.onlineState;
  let date = streamerObject.lastOnline;
  let introString = null;
  let outroString = null;

  db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
    db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                       onlineState : currentState,
                                                       lastOnline : date,
                                                       intro : introString,
                                                       outro : outroString}}}, {}, function (err, numreplaced) {
      message.reply("Stream announcements for " + streamer + " have been reset to the default.");
    });//End of db.update
  });//End of db.update
}//End of setIntro

function listStreamers (message, serverID) {
  db.findOne({_id : serverID}, function checkForDocument (err, foundDoc){
    var arrayOfStreamers = foundDoc.streamers.slice();
    var names = [];
    for(o = 0; o < arrayOfStreamers.length; o++){//Loops through to find the streamer who's name matches ours
      names.push(" " + arrayOfStreamers[o].name);
    }
    message.reply("Here are all the streamers setup on " + bot.guilds.get(serverID).name + ": " + names);
  });
}//End of listStreamers

function collectResponse (message, multiplier, callback) {
  try {
    collector = message.channel.createCollector(
      message => !message.author.bot,
      { time: replyTimeLimit*multiplier, max: 1 }
    );
    collector.on('end', (collected, reason) => {
      if (reason === "time") {
        return null;
      } else
      if (reason === "limit") {
        callback(collected);
      }
    });
  }
  catch (err) {
    console.log("Error in collectResponse function with message: " + message.toString() + "\n" + err);
  }
}//End of collectResponse
