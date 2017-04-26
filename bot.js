/*
* This is an implementation of the Picarto/Discord bot
*/
//Required frameworks
const Discord = require("discord.js"); //Required by Discord
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest; //Required to check AP
const fs = require("fs");//Required to write to disk
const Datastore = require('nedb');//Required for the database

//Primary constructors
const bot = new Discord.Client();
const botConfig = require("./config/botConfig.json");
const botPrefix = botConfig.prefix;
const refreshRate = botConfig.refreshRate;
const endNotificationDelay = botConfig.endNotificationDelay;
const replyTimeLimit = botConfig.replyTimeLimit;
var collector = null;
const APILink = "https://api.picarto.tv/v1/channel/name/";
const streamLink = "https://picarto.tv/";

db = new Datastore({ filename: "./database/streamerStates.db", autoload: true });
//TODO setup bot channel when bot is first joined to server

bot.login(botConfig.token);

bot.on("ready", () => {
  console.log("Starting...");
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
  if (message.channel.type === "dm") handleDM(message); return; //Takes care of DMs
  if (!message.content.startsWith(botPrefix)) return; //Only look for prefix messages

  let command = message.content.split(" ")[0];
  command = command.slice(botPrefix.length);
  let args = message.content.split(" ").slice(1);

  //TODO add regular chat commands


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
//Functions for db
function handleDM(message){
  let command = message.content.split(" ")[0].toLowerCase();
  let args = message.content.split(" ").slice(1);


  if (command === "help") {
    message.reply("Hello! To add a streamer's notifications to your server, reply with:\n" +
                  "`addstreamer PicartoUsername`\n" +
                  "To remove a streamer's notifications, reply with:\n" +
                  "`removestreamer PicartoUsername`");
  } else

  if (command === "addstreamer") {
    getStreamerName(message, "add");
  } else

  if (command === "removestreamer"){
    getStreamerName(message, "remove");
  } else

  if (command === "setbotchannel") {
    getServerID(message, null, "setbotchannel");
  }

  if (collector === null || collector.ended){//don't respond if the collector is running
    //console.log("Collector: " + collector);
    //console.log("Collector end status: " + collector.ended);
    message.reply("Type `help` to see basic usage or `commands` to see a full list.");
  }

  //TODO Other commands: example, configure, longExample
}

function getStreamerName(message, action){
  message.reply("Please enter the Picarto username of the streamer.");
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
}//End of getStreamerName

function getServerID(message, streamer, action){
  message.reply("Please enter your Discord ServerID.");
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
}//End of getServerID

function verifyServer(message, streamer, serverID, action){
  let serverIDArray = bot.guilds.keyArray();
  if (!serverIDArray.includes(serverID)){
    message.reply("The Picarto We're Live! bot is not a member of a server with the ID: " + serverID);
  } else {
    var server = bot.guilds.get(serverID);
    //message.reply("Server name: " + server.name);
    if (message.author.id != server.owner.id){
      message.reply("Currently only server owners can configure this service.");
    } else {
      message.reply("Hello " + server.owner.displayName + "!");
      if (action === "add") addStreamerToDB (message, streamer, serverID); else
      if (action === "remove") removeStreamerFromDB (message, streamer, serverID); else
      if (action === "setbotchannel") getBotChannel(message, serverID);
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
                                                         lastOnline : null}}}, {}, function (err, numreplaced) {
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
    console.log("An error has occured getting the API link:");
    console.log(err);
  }
}//End of checkIfStreamExists

function getBotChannel (message, serverID) {
  message.reply("Please enter the channel ID of the channel you wish the bot to use.");
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

  if (currentState === true) {//Update lastOnline
    var date = Date.now();
    db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
      db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                         onlineState : true,
                                                         lastOnline : date}}}, {}, function (err, numreplaced) {
      });//End of db.update
    });//End of db.update
  } else
  if (currentState === false) {//Announce that we have gone live!
    var date = Date.now();
    db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
      db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                         onlineState : true,
                                                         lastOnline : date}}}, {}, function (err, numreplaced) {
      bot.guilds.get(serverID).channels.get(botChanID).sendMessage("@here " + streamer + " is streaming! Join us here: " + streamLink + streamer);
      });//End of db.update
    });//End of db.update
  } else
  if (currentState === null) {// No notification because it's coming from a null state. This implies the streamer was added while live
    var date = Date.now();
    db.update({_id : serverID}, {$pull : {streamers : {name : streamer}}}, {}, function (err, numreplaced) {
      db.update({_id : serverID}, {$push : {streamers : {name : streamer,
                                                         onlineState : true,
                                                         lastOnline : date}}}, {}, function (err, numreplaced) {
      });//End of db.update
    });//End of db.update
  }
}//end of streamOnline

function streamOffline  (serverID, botChanID, streamerObject) {
  let streamer = streamerObject.name;
  let currentState = streamerObject.onlineState;
  let lastOnline = streamerObject.lastOnline;

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
                                                             lastOnline : lastOnline}}}, {}, function (err, numreplaced) {
            bot.guilds.get(serverID).channels.get(botChanID).sendMessage(streamer + " has gone offline, thanks for watching!");
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
                                                         lastOnline : null}}}, {}, function (err, numreplaced) {
      });//End of db.update
    });//End of db.update
  }
}//End of streamOffline
