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
var collector = null;

db = new Datastore({ filename: "./database/streamerStates.db", autoload: true });

bot.login(botConfig.token);

bot.on("ready", () => {
  console.log("Starting...");
  var serverIDArray = bot.guilds.keyArray();

  for (i = 0; i < serverIDArray.length; i++){
    var currentID = serverIDArray[i];
    db.findOne({_id : currentID}, function checkForDocument (err, newDoc){
      if(err){
        console.log("Error finding document: " + err);
      }
      else if (newDoc === null) {//create document
        var doc = { _id : currentID
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


});//End of bot.on(Message)

//Functions for db
function handleDM(message){ //TODO user .awaitMessages instead? Some sort of tree.
  let command = message.content.split(" ")[0].toLowerCase();
  let args = message.content.split(" ").slice(1);


  if (command === "help") {
    message.reply("Hello! To add a streamer's notifications to your server, reply with:\n" +
                  "`addstreamer PicartoUsername`\n" +
                  "To remove a streamer's notifications, reply with:\n" +
                  "`removestreamer PicartoUsername`");
  } else

  if (command === "await") {
    var filter = message => message.content.startsWith('!vote');
    message.channel.awaitMessages(filter, { max: 4, time: 10000, errors: ['time'] })
    .then(collected => console.log(collected.size))
    .catch(collected => console.log(`After ten seconds, only ${collected.size} out of 4 voted.`));
  } else

  if (command === "collect") {
      collector = message.channel.createCollector(
      message => message.content.includes('catch'),
      { time: 15000 }
    );
    collector.on('message', m => console.log(`Collected ${m.content}`));
    collector.on('end', collected => console.log(`Collected ${collected.size} items`));
  } else

  if (command === "addstreamer"){
    message.reply("Adding streamer: " + args[0]);
  } else

  if (command === "removestreamer"){
    message.reply("Removing streamer: " + args[0]);
  } else

  if (collector === null || collector.ended){//don't respond if the collector is running
    //console.log("Collector: " + collector);
    //console.log("Collector end status: " + collector.ended);
    message.reply("Type `help` to see basic usage or `commands` to see a full list.");
  }

  //TODO Other commands: example, configure, longExample
}
